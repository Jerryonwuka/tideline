"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormError } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { saveProfileAction, type FormState } from "../actions";

export function ProfileForm({ next }: { next: string }) {
  const t = useTranslations("onboarding");
  const te = useTranslations("errors");
  const [state, action, pending] = useActionState<FormState, FormData>(saveProfileAction, {});
  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="next" value={next} />
      <div>
        <span className="label-mono-sm text-accent">{t("step", { current: 1, total: 5 })}</span>
        <h1 className="mt-3 heading text-foreground">{t("profile.title")}</h1>
        <p className="mt-2 text-sm text-body">{t("profile.subtitle")}</p>
      </div>
      <FormError message={state.error ? te(state.error) : null} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="fullName">{t("profile.nameLabel")}</Label>
        <Input
          id="fullName"
          name="fullName"
          autoComplete="name"
          required
          minLength={2}
          maxLength={120}
          autoFocus
          placeholder={t("profile.namePlaceholder")}
        />
      </div>
      <Button type="submit" size="lg" disabled={pending}>
        {t("profile.submit")}
      </Button>
    </form>
  );
}
