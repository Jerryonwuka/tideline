// Local stand-ins for the tender prompts (no AI vendor configured). The parse reads requirement
// lines out of the tender itself (so every quote is real); drafts are assembled from the facts only,
// with [MISSING: …] wherever a fact isn't held. Clearly mechanical; a person edits before export.

const REQUIRE =
  /\b(must|shall|should|submit|provide|attach|include|copy of|evidence of|valid|certificate|policy|licen[cs]e)\b/i;

function category(line: string): "company" | "vessel" | "crew" | "hse" | "commercial" | "other" {
  const l = line.toLowerCase();
  if (/\b(crew|master|competency|stcw|medical)\b/.test(l)) return "crew";
  if (/\b(hse|safety|environment|incident|ppe)\b/.test(l)) return "hse";
  if (/\b(price|rate|commercial|payment|bid bond|day rate)\b/.test(l)) return "commercial";
  if (/\b(vessel|class|load line|radio|registry|flag|insurance|p&i|dp)\b/.test(l)) return "vessel";
  if (/\b(company|registration|cac|tax|nimasa|cabotage)\b/.test(l)) return "company";
  return "other";
}

export function devTenderParse(text: string) {
  const lines = text
    .split(/\n+/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter((l) => l.length >= 12);
  const reqs = lines.filter((l) => REQUIRE.test(l)).slice(0, 60);
  const deadline = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1] ?? null;
  const title = lines[0] ?? null;
  return {
    title,
    client: text.match(/(?:client|issued by|company)\s*:\s*([^\n]+)/i)?.[1]?.trim() ?? null,
    deadline,
    contract_period: text.match(/(?:contract period|duration)\s*:\s*([^\n]+)/i)?.[1]?.trim() ?? null,
    vessel_requirements: {
      type: text.match(/\b(crew boat|supply vessel|osv|tug|barge)\b/i)?.[1] ?? null,
      min_length_m: Number(text.match(/(\d+)\s*m(?:etres|eters)?\b/i)?.[1] ?? NaN) || null,
      capacity: null,
      dp_class: text.match(/\b(DP\s?[12])\b/i)?.[1] ?? null,
      max_age_years: Number(text.match(/not older than (\d+) years/i)?.[1] ?? NaN) || null,
      other: null,
    },
    requirements: reqs.map((l, i) => ({
      id: `R${i + 1}`,
      category: category(l),
      description: l.length > 160 ? `${l.slice(0, 157)}...` : l,
      source_text: l,
      mandatory: !/\b(optional|may|preferred|advantage)\b/i.test(l),
    })),
  };
}

type Facts = {
  company?: { name?: string; country?: string; registration_number?: string | null; verified?: boolean };
  vessels?: Record<string, unknown>[];
  certificates?: { type: string; for: string; expires: string | null }[];
};

const line = (label: string, value: unknown) =>
  value === null || value === undefined || value === ""
    ? `${label}: [MISSING: ${label.toLowerCase()}]`
    : `${label}: ${String(value)}`;

export function devTenderDraft(prompt: string): string {
  const facts = JSON.parse(
    prompt.slice(prompt.indexOf("Facts: ") + 7, prompt.indexOf("\nTender requirements: ")),
  ) as Facts;
  const section = prompt.slice(prompt.lastIndexOf("SECTION ") + 8).trim();
  const c = facts.company ?? {};
  const vessels = facts.vessels ?? [];
  switch (section) {
    case "cover_letter":
      return [
        "Dear Sir or Madam,",
        `${c.name ?? "[MISSING: company name]"} is pleased to submit this response to your tender.`,
        vessels.length
          ? `We propose ${vessels.map((v) => String(v.name)).join(", ")} for this work.`
          : "[MISSING: proposed vessel]",
        "The documents requested are listed in the index and attached.",
        "Yours faithfully,",
        "[MISSING: name and title of signatory]",
      ].join("\n\n");
    case "company_profile":
      return [
        line("Company", c.name),
        line("Country", c.country),
        line("Registration number", c.registration_number),
        line("Fleet size", vessels.length || null),
        "[MISSING: years in operation and relevant experience]",
      ].join("\n");
    case "vessel_specification":
      return vessels.length
        ? vessels
            .map((v) =>
              [
                line("Vessel", v.name),
                line("Type", v.type),
                line("Length (m)", v.length_m),
                line("Year built", v.year_built),
                line("Flag", v.flag),
                line("Passengers", v.passenger_capacity),
                line("Crew", v.crew_complement),
                line("Speed (kn)", v.speed_kn),
                line("Deck space (m2)", v.deck_space_m2),
                line("DP class", v.dp_class),
              ].join("\n"),
            )
            .join("\n\n")
        : "[MISSING: vessel details]";
    case "hse_statement":
      return [
        `${c.name ?? "[MISSING: company name]"} operates under a safety lock that checks weather, daylight, passenger numbers, life jackets and certificates before every departure, and records each check.`,
        facts.certificates?.length
          ? `Current certificates: ${facts.certificates.map((x) => `${x.type.replace(/_/g, " ")} (${x.for})`).join("; ")}.`
          : "[MISSING: current safety certificates]",
        "[MISSING: HSE policy, incident statistics and HSE officer contact]",
      ].join("\n\n");
    default:
      return "[MISSING: section content]";
  }
}
