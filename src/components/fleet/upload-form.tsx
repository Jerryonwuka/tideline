"use client";

import { Camera } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState, type FormEvent } from "react";
import { FormError } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { compressImage } from "@/lib/image";
import type { SubjectType } from "@/lib/schemas/fleet";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { createDocumentAction, uploadUrlAction } from "@/app/(app)/(org)/fleet-actions";

export interface UploadSubject {
  key: string;
  type: SubjectType;
  id: string;
  label: string;
  documentTypes: { code: string; label: string }[];
}

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"] as const;

/**
 * Photo/PDF + details. Images are compressed on the device, uploaded straight to private storage
 * with a one-time signed URL, then the document is recorded.
 */
export function UploadForm({
  orgId,
  subjects,
  defaultSubject,
  defaultType,
  next,
}: {
  orgId: string;
  subjects: UploadSubject[];
  defaultSubject?: string;
  defaultType?: string;
  next?: string;
}) {
  const t = useTranslations("fleet.upload");
  const te = useTranslations("errors");
  const router = useRouter();
  const [subjectKey, setSubjectKey] = useState(defaultSubject ?? subjects[0]?.key ?? "");
  const subject = useMemo(() => subjects.find((s) => s.key === subjectKey), [subjects, subjectKey]);
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<"idle" | "uploading" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!subject) return;
    const form = new FormData(e.currentTarget);
    setError(null);
    try {
      let filePath: string | undefined;
      if (file) {
        setPhase("uploading");
        const compressed = await compressImage(file);
        if (compressed.size > MAX_BYTES) throw new Error(t("fileTooLarge"));
        const contentType = (ACCEPTED as readonly string[]).includes(compressed.type) ? compressed.type : "image/jpeg";
        const target = await uploadUrlAction({
          orgId,
          subjectType: subject.type,
          subjectId: subject.id,
          contentType: contentType as (typeof ACCEPTED)[number],
        });
        const { error: upErr } = await supabaseBrowser()
          .storage.from("documents")
          .uploadToSignedUrl(target.path, target.token, compressed, { contentType });
        if (upErr) throw new Error(t("uploadFailed"));
        filePath = target.path;
      }
      setPhase("saving");
      const result = await createDocumentAction({
        orgId,
        subjectType: subject.type,
        subjectId: subject.id,
        documentTypeCode: String(form.get("documentTypeCode")),
        number: String(form.get("number") ?? ""),
        issuer: String(form.get("issuer") ?? ""),
        issueDate: String(form.get("issueDate") ?? ""),
        expiryDate: String(form.get("expiryDate") ?? ""),
        filePath,
      });
      if (result.error) throw new Error(te(result.error));
      router.push(next ?? `/documents/${result.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : te("unknown"));
      setPhase("idle");
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <FormError message={error} />
      {subjects.length > 1 && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="subject">{t("forLabel")}</Label>
          <NativeSelect id="subject" value={subjectKey} onChange={(e) => setSubjectKey(e.target.value)}>
            {subjects.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="documentTypeCode">{t("typeLabel")}</Label>
        <NativeSelect id="documentTypeCode" name="documentTypeCode" key={subjectKey} defaultValue={defaultType}>
          {subject?.documentTypes.map((d) => (
            <option key={d.code} value={d.code}>
              {d.label}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="flex flex-col gap-2">
        <span className="label-mono-sm text-meta">{t("fileLabel")}</span>
        <label className="flex cursor-pointer items-center gap-3 rounded-sm border border-dashed border-hairline-strong bg-surface-sunken px-4 py-5 text-sm text-body transition-colors hover:border-accent has-focus-visible:outline-2 has-focus-visible:outline-accent">
          <Camera className="size-5 text-accent" />
          <span className="truncate">{file ? file.name : t("takePhoto")}</span>
          <input
            type="file"
            name="file"
            accept="image/*,application/pdf"
            capture="environment"
            className="sr-only"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <span className="text-xs text-meta">{t("fileHint")}</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="number">{t("number")}</Label>
          <Input id="number" name="number" maxLength={80} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="issuer">{t("issuer")}</Label>
          <Input id="issuer" name="issuer" maxLength={120} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="issueDate">{t("issueDate")}</Label>
          <Input id="issueDate" name="issueDate" type="date" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="expiryDate">{t("expiryDate")}</Label>
          <Input id="expiryDate" name="expiryDate" type="date" />
        </div>
      </div>
      <p className="text-xs text-meta">{t("datesHint")}</p>
      <Button type="submit" size="lg" disabled={phase !== "idle"}>
        {phase === "uploading" ? t("uploading") : phase === "saving" ? t("saving") : t("save")}
      </Button>
    </form>
  );
}
