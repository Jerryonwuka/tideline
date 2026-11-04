import type { ReactNode } from "react";
import { AppShell } from "@/components/app/app-shell";
import { requireOrgContext } from "@/server/auth/session";

export default async function OrgLayout({ children }: { children: ReactNode }) {
  const { me, membership } = await requireOrgContext("/dashboard");
  return (
    <AppShell me={me} membership={membership}>
      {children}
    </AppShell>
  );
}
