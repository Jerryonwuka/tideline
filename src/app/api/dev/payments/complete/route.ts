import { NextResponse } from "next/server";
import { z } from "zod";
import { completeFakePayment } from "@/server/dev/fake-payments";

export const dynamic = "force-dynamic";

/** Local-only: complete a fake checkout (see completeFakePayment). 404 elsewhere. */
export async function POST(request: Request) {
  const { reference, outcome } = z
    .object({ reference: z.string().min(4), outcome: z.enum(["success", "failed"]).default("success") })
    .parse(await request.json());
  const result = await completeFakePayment(reference, outcome);
  return result ? NextResponse.json(result) : new NextResponse(null, { status: 404 });
}
