"use client";

import { useTranslations } from "next-intl";
import { useActionState, type ReactNode } from "react";
import { FormError } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { readManifestAction, type ConsoleState } from "@/app/(app)/admin/console-actions";

type Action = (s: ConsoleState, f: FormData) => Promise<ConsoleState>;

/** A small form posting hidden fields to a console action, with its error shown inline. */
export function ConsoleForm({
  action,
  fields,
  children,
  label,
  variant = "secondary",
}: {
  action: Action;
  fields: Record<string, string>;
  children?: ReactNode;
  label: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  const te = useTranslations("errors");
  const [state, run, pending] = useActionState<ConsoleState, FormData>(action, {});
  return (
    <form action={run} className="flex flex-wrap items-center gap-2">
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {children}
      <Button type="submit" variant={variant} disabled={pending}>
        {label}
      </Button>
      {state.error && <span className="text-sm text-danger">{te(state.error)}</span>}
    </form>
  );
}

export function ManifestLookup() {
  const t = useTranslations("console.passengers");
  const te = useTranslations("errors");
  const [state, run, pending] = useActionState<ConsoleState, FormData>(readManifestAction, {});
  return (
    <div className="flex flex-col gap-4">
      <form action={run} className="flex max-w-xl flex-col gap-3">
        <FormError message={state.error ? te(state.error) : null} />
        <div className="flex flex-col gap-2">
          <Label htmlFor="tripId">{t("tripId")}</Label>
          <Input id="tripId" name="tripId" required defaultValue={state.tripId ?? ""} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="reason">{t("reason")}</Label>
          <Input id="reason" name="reason" maxLength={300} />
          <p className="text-xs text-meta">{t("reasonHint")}</p>
        </div>
        <Button type="submit" disabled={pending} className="w-fit">
          {t("open")}
        </Button>
      </form>
      {state.rows && (
        <ul className="rounded-md border border-hairline" data-testid="admin-manifest">
          {state.rows.length === 0 && <li className="px-4 py-3 text-sm text-body">{t("empty")}</li>}
          {state.rows.map((r) => (
            <li
              key={r.id}
              className="flex justify-between gap-3 border-b border-hairline px-4 py-2 text-sm last:border-b-0"
            >
              <span className="text-foreground">{r.full_name}</span>
              <span className="font-mono text-meta">
                {r.phone_e164 ?? ""} · {t("seats", { count: r.seats })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
