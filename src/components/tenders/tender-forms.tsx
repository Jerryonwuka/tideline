"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { FormError } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import {
  createTenderAction,
  draftAction,
  exportAction,
  mappingAction,
  parseTenderAction,
  reviewAction,
  sectionAction,
  submitAnywayAction,
  vesselsAction,
  type TenderState,
} from "@/app/(app)/(org)/tender-actions";
import { MISSING_MARKER, type SectionKey } from "@/lib/tenders";

type Action = (s: TenderState, f: FormData) => Promise<TenderState>;
const textarea =
  "rounded-xs border border-hairline-strong bg-surface-sunken p-3 text-sm text-foreground focus-visible:border-accent focus-visible:outline-none";

export function NewTenderForm() {
  const t = useTranslations("tenders");
  const te = useTranslations("errors");
  const [state, action, pending] = useActionState<TenderState, FormData>(createTenderAction, {});
  return (
    <form action={action} className="flex max-w-3xl flex-col gap-5">
      <FormError message={state.error ? te(state.error) : null} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="title">{t("fields.title")}</Label>
        <Input id="title" name="title" required minLength={3} maxLength={200} />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="clientName">{t("fields.client")}</Label>
          <Input id="clientName" name="clientName" maxLength={200} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="deadline">{t("fields.deadline")}</Label>
          <Input id="deadline" name="deadline" type="date" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="text">{t("fields.text")}</Label>
        <p className="text-sm text-meta">{t("fields.textHint")}</p>
        <textarea id="text" name="text" rows={12} maxLength={200000} className={textarea} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="file">{t("fields.file")}</Label>
        <input id="file" name="file" type="file" accept="application/pdf,image/jpeg,image/png" className="text-sm" />
      </div>
      <Button type="submit" disabled={pending} className="w-fit">
        {t("create")}
      </Button>
    </form>
  );
}

/** A one-button form bound to a tender. */
export function TenderButton({
  tenderId,
  kind,
  label,
  variant = "secondary",
}: {
  tenderId: string;
  kind: "parse" | "draft" | "review" | "export";
  label: string;
  variant?: "primary" | "secondary";
}) {
  const te = useTranslations("errors");
  const fn: Action = { parse: parseTenderAction, draft: draftAction, review: reviewAction, export: exportAction }[kind];
  const [state, action, pending] = useActionState<TenderState, FormData>(fn, {});
  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="tenderId" value={tenderId} />
      <Button type="submit" variant={variant} disabled={pending} className="w-fit">
        {label}
      </Button>
      {state.error && <span className="text-sm text-danger">{te(state.error)}</span>}
    </form>
  );
}

export function VesselPicker({
  tenderId,
  vessels,
  selected,
}: {
  tenderId: string;
  vessels: { id: string; name: string }[];
  selected: string[];
}) {
  const t = useTranslations("tenders");
  const te = useTranslations("errors");
  const [state, action, pending] = useActionState<TenderState, FormData>(vesselsAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="tenderId" value={tenderId} />
      <div className="flex flex-wrap gap-4">
        {vessels.map((v) => (
          <label key={v.id} className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" name="vesselId" value={v.id} defaultChecked={selected.includes(v.id)} />
            {v.name}
          </label>
        ))}
      </div>
      <Button type="submit" variant="secondary" disabled={pending} className="w-fit">
        {t("match")}
      </Button>
      {state.error && <span className="text-sm text-danger">{te(state.error)}</span>}
    </form>
  );
}

export function MapDocumentForm({
  tenderId,
  requirementId,
  documents,
  current,
}: {
  tenderId: string;
  requirementId: string;
  documents: { id: string; label: string }[];
  current: string | null;
}) {
  const t = useTranslations("tenders");
  const te = useTranslations("errors");
  const [state, action, pending] = useActionState<TenderState, FormData>(mappingAction, {});
  return (
    <form action={action} className="flex items-end gap-2">
      <input type="hidden" name="tenderId" value={tenderId} />
      <input type="hidden" name="requirementId" value={requirementId} />
      <div className="flex w-64 flex-col gap-1">
        <label htmlFor={`doc-${requirementId}`} className="sr-only">
          {t("pickDocument")}
        </label>
        <NativeSelect
          id={`doc-${requirementId}`}
          name="documentId"
          defaultValue={current ?? ""}
          className="h-9 text-sm"
        >
          <option value="">{t("noDocument")}</option>
          {documents.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </NativeSelect>
      </div>
      <Button type="submit" variant="ghost" disabled={pending}>
        {t("attach")}
      </Button>
      {state.error && <span className="text-sm text-danger">{te(state.error)}</span>}
    </form>
  );
}

export function SectionEditor({ tenderId, section, text }: { tenderId: string; section: SectionKey; text: string }) {
  const t = useTranslations("tenders");
  const te = useTranslations("errors");
  const [value, setValue] = useState(text);
  const [synced, setSynced] = useState(text);
  // A fresh draft from the server replaces the editor's text.
  if (text !== synced) {
    setSynced(text);
    setValue(text);
  }
  const [state, action, pending] = useActionState<TenderState, FormData>(sectionAction, {});
  const markers = [...value.matchAll(MISSING_MARKER)].length;
  return (
    <form action={action} className="flex flex-col gap-2" data-testid={`section-${section}`}>
      <input type="hidden" name="tenderId" value={tenderId} />
      <input type="hidden" name="section" value={section} />
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={`section-${section}-text`}>{t(`section.${section}`)}</Label>
        <span className={markers ? "text-sm text-danger" : "text-sm text-meta"}>
          {t("markers", { count: markers })}
        </span>
      </div>
      <textarea
        id={`section-${section}-text`}
        name="text"
        rows={10}
        maxLength={20000}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className={textarea}
      />
      <div className="flex items-center gap-3">
        <Button type="submit" variant="secondary" disabled={pending}>
          {t("save")}
        </Button>
        {state.ok && <span className="text-sm text-meta">{t("saved")}</span>}
        {state.error && <span className="text-sm text-danger">{te(state.error)}</span>}
      </div>
    </form>
  );
}

export function SubmitAnywayForm({ tenderId, on }: { tenderId: string; on: boolean }) {
  const t = useTranslations("tenders");
  const [, action, pending] = useActionState<TenderState, FormData>(submitAnywayAction, {});
  return (
    <form action={action} className="flex items-center gap-3">
      <input type="hidden" name="tenderId" value={tenderId} />
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          name="on"
          defaultChecked={on}
          disabled={pending}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
        />
        {t("submitAnyway")}
      </label>
    </form>
  );
}
