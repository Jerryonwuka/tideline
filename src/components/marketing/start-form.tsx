"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { Brackets } from "@/components/marketing/brackets";
import { Button } from "@/components/ui/button";

export const START_PHONE_KEY = "tl_start_phone";

/**
 * Phone number in, straight to sign-up. The number is handed to the login page through
 * sessionStorage, never the URL. Without JavaScript the form still lands on /login (the input has
 * no name, so nothing is put in the query string).
 */
export function StartForm({ id }: { id?: string }) {
  const t = useTranslations("home.start");
  const router = useRouter();
  const [phone, setPhone] = useState("");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      if (phone.trim()) sessionStorage.setItem(START_PHONE_KEY, phone.trim());
    } catch {
      // Storage can be unavailable (private mode); the login page simply starts empty.
    }
    router.push("/login");
  }

  return (
    <form id={id} action="/login" onSubmit={onSubmit} className="group/brackets relative w-full max-w-md scroll-mt-32">
      <Brackets size={8} offset={6} className="text-foreground/40" />
      <div className="flex items-center gap-1.5 rounded-xs border border-hairline-strong bg-surface/70 p-1.5 backdrop-blur">
        <label htmlFor={`${id ?? "start"}-phone`} className="sr-only">
          {t("label")}
        </label>
        <input
          id={`${id ?? "start"}-phone`}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={t("placeholder")}
          className="h-10 min-w-0 flex-1 bg-transparent px-3 text-[0.9375rem] text-foreground outline-none placeholder:text-meta"
        />
        <Button type="submit" size="md" marks={false}>
          {t("button")}
        </Button>
      </div>
      <p className="mt-3 label-mono-sm text-meta">{t("note")}</p>
    </form>
  );
}
