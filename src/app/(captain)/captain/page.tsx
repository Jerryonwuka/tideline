import { Suspense } from "react";
import { requireOrgContext } from "@/server/auth/session";
import { captainSnapshot } from "@/server/services/sync";
import { CaptainApp } from "./captain-app";

/** Seeds the phone's offline store; the screens themselves render from that store (BUILD_SPEC §8). */
export default async function CaptainPage() {
  const { db, me, membership } = await requireOrgContext("/captain");
  const snapshot = await captainSnapshot(db, me, membership);
  return (
    <Suspense>
      <CaptainApp initial={snapshot} />
    </Suspense>
  );
}
