import { NextResponse } from "next/server";
import { z } from "zod";
import { mappingSchema, sectionSchema, vesselsSchema } from "@/lib/schemas/tenders";
import { parseJson, requireUuid, route } from "@/server/http";
import { ServiceError } from "@/server/services/errors";
import { getMe } from "@/server/services/profile";
import {
  draftSections,
  exportPack,
  mapManually,
  markReviewed,
  parseTender,
  refreshMapping,
  saveSection,
  setSubmitAnyway,
} from "@/server/services/tenders";
import { supabaseForRequest } from "@/server/supabase/server";

type Ctx = { params: Promise<{ id: string; action: string }> };

/** Tender steps: parse, vessels, map, draft, section, review, submit-anyway, export. */
export const POST = route<Ctx>(async (request, { params }) => {
  const { id: rawId, action } = await params;
  const id = requireUuid(rawId);
  const db = await supabaseForRequest(request);
  const me = await getMe(db);
  if (!me) throw new ServiceError("not_authenticated");
  switch (action) {
    case "parse":
      return NextResponse.json(await parseTender(db, id));
    case "vessels":
      return NextResponse.json(await refreshMapping(db, id, (await parseJson(request, vesselsSchema)).vesselIds));
    case "map": {
      const m = await parseJson(request, mappingSchema);
      await mapManually(db, id, m.requirementId, m.documentId);
      return NextResponse.json({ ok: true });
    }
    case "draft":
      return NextResponse.json(await draftSections(db, id));
    case "section": {
      const s = await parseJson(request, sectionSchema);
      await saveSection(db, id, s.section, s.text);
      return NextResponse.json({ ok: true });
    }
    case "review":
      await markReviewed(db, me, id);
      return NextResponse.json({ ok: true });
    case "submit-anyway":
      await setSubmitAnyway(db, me, id, (await parseJson(request, z.object({ on: z.boolean() }))).on);
      return NextResponse.json({ ok: true });
    case "export":
      return NextResponse.json(await exportPack(db, me, id));
    default:
      throw new ServiceError("not_found");
  }
});
