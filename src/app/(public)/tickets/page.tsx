import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { ticketCodeSchema } from "@/lib/schemas/tickets";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("ticket"))("lookupTitle") };
}

async function find(formData: FormData) {
  "use server";
  const code = ticketCodeSchema.safeParse(formData.get("code"));
  redirect(`/tickets/${code.success ? code.data : "unknown"}`);
}

/** Ticket lookup by code. */
export default async function TicketLookupPage() {
  const t = await getTranslations("ticket");
  return (
    <AuthShell>
      <h1 className="heading text-foreground">{t("lookupTitle")}</h1>
      <p className="mb-6 text-body">{t("lookupHint")}</p>
      <form action={find} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="code">{t("code")}</Label>
          <Input
            id="code"
            name="code"
            required
            minLength={8}
            maxLength={8}
            autoCapitalize="characters"
            className="font-mono uppercase"
          />
        </div>
        <Button type="submit">{t("find")}</Button>
      </form>
    </AuthShell>
  );
}
