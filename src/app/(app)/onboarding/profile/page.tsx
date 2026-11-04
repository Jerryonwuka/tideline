import { AuthShell } from "@/components/auth/auth-shell";
import { requireMe, safeNext } from "@/server/auth/session";
import { ProfileForm } from "./profile-form";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next) ?? "";
  await requireMe("/onboarding/profile");
  return (
    <AuthShell>
      <ProfileForm next={next} />
    </AuthShell>
  );
}
