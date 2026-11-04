import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { ButtonLink } from "@/components/ui/button";
import { invitationTokenSchema } from "@/lib/schemas/members";
import { currentUser } from "@/server/auth/session";
import { previewInvitation } from "@/server/services/members";
import { AcceptForm } from "./accept-form";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [t, tRoles] = await Promise.all([getTranslations("invite"), getTranslations("roles")]);
  const valid = invitationTokenSchema.safeParse(token);
  const { db, me } = await currentUser();
  const preview = valid.success ? await previewInvitation(db, token) : null;
  const path = `/invite/${token}`;
  if (me && !me.fullName) redirect(`/onboarding/profile?next=${encodeURIComponent(path)}`);

  let body: React.ReactNode;
  if (!preview || preview.status !== "valid") {
    const key = !preview ? "invalid" : preview.status;
    body = (
      <div className="flex flex-col gap-5">
        <h1 className="heading text-foreground">{t("title")}</h1>
        <p className="text-sm text-body">{t(key)}</p>
        <ButtonLink variant="secondary" href="/">
          {t("home")}
        </ButtonLink>
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col gap-5">
        <span className="label-mono-sm text-accent">{tRoles(preview.role)}</span>
        <h1 className="heading text-foreground">{t("title")}</h1>
        <p className="body-lg text-body">{t("body", { org: preview.orgName, role: tRoles(preview.role) })}</p>
        {me ? (
          <AcceptForm token={token} />
        ) : (
          <>
            <ButtonLink size="lg" href={`/login?next=${encodeURIComponent(path)}`}>
              {t("login")}
            </ButtonLink>
            <p className="text-xs text-meta">{t("loginHint")}</p>
          </>
        )}
      </div>
    );
  }
  return <AuthShell>{body}</AuthShell>;
}
