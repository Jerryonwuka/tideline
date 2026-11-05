import { redirect } from "next/navigation";

/** Old link (e.g. shared in WhatsApp); captain screens are client-side views of /captain. */
export default async function CaptainTripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/captain?trip=${encodeURIComponent(id)}`);
}
