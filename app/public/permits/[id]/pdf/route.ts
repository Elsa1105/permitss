import { NextResponse } from "next/server";
import { createServiceRoleSupabase } from "@/lib/supabase/server";
import { generatePermitPdf } from "@/lib/pdf/generate-permit-pdf";
import { DOCUMENT_BUCKET, STORAGE_BUCKET } from "@/lib/supabase/env";
import type {
  PermitDocumentRow,
  PermitEndorsementRow,
  PermitPhotoRow,
  PermitStageRow,
  PermitWithJoins,
} from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

const PERMIT_WITH_JOINS = `
  *,
  applicant:applicant_id ( id, full_name, department, email ),
  assessor:assessor_id ( id, full_name, department, email ),
  srm:srm_id ( id, full_name, department, email ),
  closer:closer_id ( id, full_name, department, email ),
  company:company_id ( id, code, name ),
  site:site_id ( id, code, name )
`;

/**
 * ePermit enhancement request #4: scanning the permit QR code must show the
 * endorsed PDF record directly, without requiring login, including all
 * approval dates and endorsement details for on-site verification. This
 * route uses the service-role client (no user session) and only serves the
 * same read-only status/endorsement data already shown on the linked
 * /public/permits/[id] status page — no confidential admin data.
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = createServiceRoleSupabase();

  const { data: permit, error } = await supabase
    .from("permits")
    .select(PERMIT_WITH_JOINS)
    .eq("id", id)
    .maybeSingle();

  if (error || !permit) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [{ data: stages }, { data: endorsements }, { data: photos }, { data: documents }] =
    await Promise.all([
      supabase
        .from("permit_stages")
        .select("*")
        .eq("permit_id", id)
        .order("submitted_at", { ascending: true }),
      supabase
        .from("permit_endorsements")
        .select("*, endorser:endorser_id ( full_name )")
        .eq("permit_id", id)
        .order("day_number", { ascending: true }),
      supabase
        .from("permit_photos")
        .select(
          "id, permit_id, storage_path, annotation_data, uploaded_by, uploaded_at, caption",
        )
        .eq("permit_id", id)
        .order("uploaded_at", { ascending: true }),
      supabase
        .from("permit_documents")
        .select("*")
        .eq("permit_id", id)
        .order("created_at", { ascending: true }),
    ]);

  const bucket = STORAGE_BUCKET();
  const documentBucket = DOCUMENT_BUCKET();

  const photosWithBytes = await Promise.all(
    ((photos ?? []) as PermitPhotoRow[]).map(async (photo) => {
      try {
        const { data: signed } = await supabase.storage
          .from(bucket)
          .createSignedUrl(photo.storage_path, 60);

        if (!signed?.signedUrl) return photo;

        const res = await fetch(signed.signedUrl);
        if (!res.ok) return photo;

        const buf = new Uint8Array(await res.arrayBuffer());
        const mime = res.headers.get("content-type") || "image/jpeg";

        return { ...photo, bytes: buf, mime };
      } catch {
        return photo;
      }
    }),
  );

  const documentsWithSignedUrls = await Promise.all(
    ((documents ?? []) as PermitDocumentRow[]).map(async (document) => {
      try {
        const { data: signed } = await supabase.storage
          .from(documentBucket)
          .createSignedUrl(document.storage_path, 60);

        return { ...document, signedUrl: signed?.signedUrl };
      } catch {
        return document;
      }
    }),
  );

  const origin =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3000";

  const publicPermitUrl = `${origin}/public/permits/${id}`;

  const pdfBytes = await generatePermitPdf({
    permit: permit as unknown as PermitWithJoins,
    stages: (stages ?? []) as PermitStageRow[],
    endorsements: (endorsements ?? []) as unknown as PermitEndorsementRow[],
    photos: photosWithBytes,
    documents: documentsWithSignedUrls,
    publicPermitUrl,
  });

  return new NextResponse(new Uint8Array(pdfBytes).buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${(permit as { serial_no: string }).serial_no}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
