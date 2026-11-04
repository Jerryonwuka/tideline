"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { publishRuleSetAction, type AdminState } from "../actions";

export function PublishForm({ id, label }: { id: string; label: string }) {
  const t = useTranslations("admin.ruleSets");
  const te = useTranslations("errors");
  const [state, action, pending] = useActionState<AdminState, FormData>(publishRuleSetAction, {});
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(t("publishConfirm", { name: label }))) e.preventDefault();
      }}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-wrap items-center gap-2">
        <Input
          name="note"
          placeholder={t("notePlaceholder")}
          aria-label={t("noteLabel")}
          className="h-9 w-64 text-sm"
          maxLength={500}
        />
        <Button type="submit" size="sm" disabled={pending}>
          {t("publish")}
        </Button>
      </div>
      {state.error && <span className="text-xs text-danger">{te(state.error)}</span>}
    </form>
  );
}
