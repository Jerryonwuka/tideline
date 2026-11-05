import { redirect } from "next/navigation";

/** Old link; captain screens are client-side views of /captain (they work offline). */
export default function NewCaptainTripPage() {
  redirect("/captain?view=new");
}
