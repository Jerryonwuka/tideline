import { NextResponse } from "next/server";
import { z } from "zod";
import { uuid } from "@/lib/schemas/common";
import { parseJson, requireUuid, route } from "@/server/http";
import { generateContract, getContractForCharter, signedPdfUrl } from "@/server/services/contracts";
import { supabaseForRequest } from "@/server/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

/** The charter's contract with a 5-minute PDF link. */
export const GET = route<Ctx>(async (request, { params }) => {
  const contract = await getContractForCharter(await supabaseForRequest(request), requireUuid((await params).id));
  return NextResponse.json(contract ? { ...contract, pdf_url: await signedPdfUrl(contract.pdf_path) } : null);
});

/** Owner generates (or, before anyone accepts, regenerates) the contract from a template. */
export const POST = route<Ctx>(async (request, { params }) => {
  const id = requireUuid((await params).id);
  const { template_id } = await parseJson(request, z.object({ template_id: uuid.optional() }));
  return NextResponse.json(
    { id: await generateContract(await supabaseForRequest(request), id, template_id) },
    { status: 201 },
  );
});
