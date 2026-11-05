"use client";

import { useSearchParams } from "next/navigation";

// Captain screens are one page with client-side views, so moving between them never needs the
// network (a server round trip would fail offline). The URL still reflects the view.

export type View = { name: "today" } | { name: "new" } | { name: "pending" } | { name: "trip"; key: string };

export function useView(): View {
  const params = useSearchParams();
  const trip = params.get("trip");
  if (trip) return { name: "trip", key: trip };
  const view = params.get("view");
  if (view === "new" || view === "pending") return { name: view };
  return { name: "today" };
}

export function go(view: View) {
  const query =
    view.name === "trip" ? `?trip=${encodeURIComponent(view.key)}` : view.name === "today" ? "" : `?view=${view.name}`;
  window.history.pushState(null, "", `/captain${query}`);
  window.scrollTo(0, 0);
}
