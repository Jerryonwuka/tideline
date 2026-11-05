"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState } from "react";
import { FormError } from "@/components/auth/auth-shell";
import { START_PHONE_KEY } from "@/components/marketing/start-form";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { sendCodeAction, verifyCodeAction, type ActionResult } from "@/server/auth/actions";

export function LoginForm({ next, countryName, devHint }: { next: string; countryName: string; devHint: boolean }) {
  const t = useTranslations("auth");
  const te = useTranslations("errors");
  const [sent, sendAction, sending] = useActionState<ActionResult, FormData>(sendCodeAction, {});
  const [verified, verifyAction, verifying] = useActionState<ActionResult, FormData>(verifyCodeAction, {});
  const [phoneInput, setPhoneInput] = useState("");
  const [editing, setEditing] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  // A number typed on the landing page arrives through sessionStorage (never the URL).
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(START_PHONE_KEY);
      if (saved) {
        setPhoneInput(saved);
        sessionStorage.removeItem(START_PHONE_KEY);
      }
    } catch {
      // Storage unavailable; start empty.
    }
  }, []);

  const phone = sent.ok && !editing ? sent.phone : undefined;
  useEffect(() => {
    if (phone) codeRef.current?.focus();
  }, [phone]);

  if (!phone) {
    return (
      <form
        action={(fd) => {
          setEditing(false);
          sendAction(fd);
        }}
        className="flex flex-col gap-5"
      >
        <div>
          <h1 className="heading text-foreground">{t("title")}</h1>
          <p className="mt-2 text-sm text-body">{t("subtitle")}</p>
        </div>
        <FormError message={sent.error ? te(sent.error) : null} />
        <div className="flex flex-col gap-2">
          <Label htmlFor="phone">{t("phoneLabel")}</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            required
            autoFocus
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value)}
            placeholder={t("phonePlaceholder")}
            aria-invalid={!!sent.error}
          />
          <p className="text-xs text-meta">{t("phoneHint", { country: countryName })}</p>
        </div>
        <Button type="submit" size="lg" disabled={sending}>
          {sending ? t("sending") : t("sendCode")}
        </Button>
        <p className="text-xs text-meta">{t("terms")}</p>
      </form>
    );
  }

  return (
    <form action={verifyAction} className="flex flex-col gap-5">
      <input type="hidden" name="phone" value={phone} />
      <input type="hidden" name="next" value={next} />
      <div>
        <h1 className="heading text-foreground">{t("codeTitle")}</h1>
        <p className="mt-2 text-sm text-body">{t("codeSubtitle", { phone })}</p>
      </div>
      <FormError message={verified.error ? te(verified.error) : null} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="code">{t("codeLabel")}</Label>
        <Input
          ref={codeRef}
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          className="font-mono text-lg tracking-[0.4em]"
          aria-invalid={!!verified.error}
        />
        {devHint && <p className="text-xs text-meta">{t("devHint")}</p>}
      </div>
      <Button type="submit" size="lg" disabled={verifying}>
        {verifying ? t("verifying") : t("verify")}
      </Button>
      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="cursor-pointer text-body hover:text-foreground"
        >
          {t("changeNumber")}
        </button>
        <button
          type="button"
          onClick={() => {
            const fd = new FormData();
            fd.set("phone", phone);
            sendAction(fd);
          }}
          className="cursor-pointer text-accent hover:underline"
        >
          {t("resend")}
        </button>
      </div>
    </form>
  );
}
