"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormError } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import type { ErrorCode } from "@/server/services/errors";
import { acceptInvitationAction } from "./actions";

export function AcceptForm({ token }: { token: string }) {
  const t = useTranslations("invite");
  const te = useTranslations("errors");
  const [state, action, pending] = useActionState<{ error?: ErrorCode }, FormData>(acceptInvitationAction, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <FormError message={state.error ? te(state.error) : null} />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? t("accepting") : t("accept")}
      </Button>
    </form>
  );
}
