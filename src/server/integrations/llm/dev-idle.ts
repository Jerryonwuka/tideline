// Local stand-ins for the idle-vessel prompts (no AI vendor configured): plain sentences assembled
// from the numbers and profile in the prompt only.

type Vessel = {
  name?: string;
  type?: string;
  length_m?: number | null;
  year_built?: number | null;
  area?: string | null;
};
type Pricing = {
  rate?: string | null;
  inputs?: { baseline_source?: string; weeks_idle?: number; board_listings?: number; floored?: boolean };
};

export function devIdleListing(message: string) {
  const vessel = JSON.parse(message.slice(message.indexOf("Vessel: ") + 8, message.indexOf("\nPricing: "))) as Vessel;
  const pricing = JSON.parse(message.slice(message.indexOf("Pricing: ") + 9)) as Pricing;
  const i = pricing.inputs ?? {};
  const source =
    i.baseline_source === "vessel"
      ? "this vessel's recent charters"
      : i.baseline_source === "org_same_type"
        ? "your other vessels of the same type"
        : i.baseline_source === "board"
          ? "similar listings on the board"
          : "no past rates";
  const rationale = [
    `Based on ${source}${i.board_listings ? ", adjusted toward similar board listings" : ""}.`,
    i.weeks_idle ? `Reduced a little for each full week idle.` : null,
    i.floored ? `Held at your minimum rate.` : null,
  ]
    .filter(Boolean)
    .join(" ");
  const type = (vessel.type ?? "vessel").replace(/_/g, " ");
  const description = [
    `${vessel.name ?? "This vessel"} is a ${type} available for charter${vessel.area ? ` in ${vessel.area}` : ""}.`,
    vessel.length_m ? `Length ${vessel.length_m} m.` : null,
    vessel.year_built ? `Built ${vessel.year_built}.` : null,
    "Contact the owner for availability and terms.",
  ]
    .filter(Boolean)
    .join(" ");
  return { rationale, description };
}

export function devIdleOutreach(prompt: string): string {
  const owner = /from (.+?) to /.exec(prompt)?.[1] ?? "We";
  const buyer = / to (.+?) offering/.exec(prompt)?.[1] ?? "there";
  const vessel = JSON.parse(/Vessel: (.+)\n/.exec(prompt)?.[1] ?? "{}") as Vessel;
  const rate = /Day rate: (.+)\n/.exec(prompt)?.[1] ?? "on request";
  return `Hello ${buyer}, this is ${owner}. Our ${(vessel.type ?? "vessel").replace(/_/g, " ")} ${vessel.name ?? ""} is available for charter${vessel.area ? ` in ${vessel.area}` : ""}. Day rate: ${rate}. Would you like details?`.replace(
    /\s+/g,
    " ",
  );
}
