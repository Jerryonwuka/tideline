// Contract templates: {{variable}} placeholders filled from the charter. Unknown or empty variables
// are shown as "[not set]" so a missing term is visible rather than silently blank.

export const PLACEHOLDER = /\{\{\s*([a-z_]+)\s*\}\}/g;

export function renderTemplate(body: string, vars: Record<string, string | number | null | undefined>): string {
  return body.replace(PLACEHOLDER, (_, name: string) => {
    const v = vars[name];
    return v === null || v === undefined || v === "" ? "[not set]" : String(v);
  });
}

export function templateVariables(body: string): string[] {
  return [...new Set([...body.matchAll(PLACEHOLDER)].map((m) => m[1]!))];
}
