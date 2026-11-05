import type { ChatEvent, ChatRequest } from "./types";

// Local stand-in for the assistant's model (no AI vendor configured): routes a question to one
// read tool by keywords, then answers only from that tool's result. Requests to move money,
// delete data or override safety are declined, as the real system prompt requires.

const usage = { model: "fake-assistant", tokensIn: 0, tokensOut: 0, latencyMs: 0 };
const say = (text: string): ChatEvent[] => [
  { type: "text", text },
  { type: "done", usage },
];

const REFUSE =
  /\b(pay|send|transfer|refund|withdraw|move)\b.*\b(money|naira|₦|\d)|\b(delete|remove)\b|\b(override|approve|bypass|skip)\b.*\b(safety|lock|check|block)/i;

function pickTool(question: string): { name: string; input: Record<string, unknown> } | null {
  const q = question.toLowerCase();
  if (/expir|certificat|document|licen[cs]e/.test(q)) {
    const monthEnd = new Date();
    monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1, 0);
    return {
      name: "list_expiring_documents",
      input: /this month/.test(q) ? { until: monthEnd.toISOString().slice(0, 10) } : {},
    };
  }
  if (/idle|not working|unused/.test(q)) return { name: "list_idle_vessels", input: {} };
  if (/takings|report|today|passengers|how much|money made|cash/.test(q))
    return { name: "get_daily_report", input: {} };
  if (/invoice/.test(q)) return { name: "list_open_invoices", input: {} };
  if (/vessel|boat|status|where/.test(q)) return { name: "get_vessel_status", input: {} };
  return null;
}

function answer(tool: string, result: unknown): string {
  const r = result as Record<string, unknown>;
  switch (tool) {
    case "list_expiring_documents": {
      const docs = (r.documents ?? []) as { type: string; for: string; expires_display: string; status: string }[];
      if (!docs.length) return `No documents expire by ${r.until}.`;
      return [
        `${docs.length} document(s) expire by ${r.until}:`,
        ...docs
          .slice(0, 5)
          .map((d) => `• ${d.type.replace(/_/g, " ")} for ${d.for}: ${d.expires_display} (${d.status})`),
      ].join("\n");
    }
    case "get_daily_report": {
      const t = r.totals as { trips: number; passengers: number; cash: string; digital: string };
      return `${r.date}: ${t.trips} trip(s), ${t.passengers} passengers, ${t.cash} cash and ${t.digital} digital.`;
    }
    case "list_idle_vessels": {
      const v = result as { name: string }[];
      return v.length ? `Idle this week: ${v.map((x) => x.name).join(", ")}.` : "Every vessel has worked this week.";
    }
    case "list_open_invoices":
      return String(r.note ?? "No open invoices.");
    case "get_vessel_status": {
      const v = result as { name: string; status: string; trips_today: unknown[] }[];
      return (
        v
          .map((x) => `• ${x.name}: ${x.status}, ${x.trips_today.length} trip(s) today`)
          .slice(0, 5)
          .join("\n") || "No vessels yet. Add one under Vessels."
      );
    }
    default:
      return "Done.";
  }
}

export function devAssistant(req: ChatRequest): ChatEvent[] {
  const question = [...req.messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const toolResult = [...req.messages].reverse().find((m) => m.role === "tool");
  if (REFUSE.test(question)) {
    return say(
      "I can't move money, delete records or approve safety overrides. I can show reports, documents and trips, or prepare a draft for you to check.",
    );
  }
  const pick = pickTool(question);
  if (!pick)
    return say(
      "I can tell you about expiring documents, today's takings, trips, vessel status and idle vessels. What would you like to know?",
    );
  if (!toolResult)
    return [
      { type: "tool_call", id: `call_${pick.name}`, name: pick.name, input: pick.input },
      { type: "done", usage },
    ];
  return say(answer(pick.name, JSON.parse(toolResult.content)));
}
