import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  getEndorsements,
  getPermit,
  getPermitDocuments,
  getPermitStages,
  getPhotos,
} from "@/lib/permits/queries";
import { generatePermitPdf } from "@/lib/pdf/generate-permit-pdf";
import { DOCUMENT_BUCKET, STORAGE_BUCKET } from "@/lib/supabase/env";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = await createServerSupabase();

  const { data: auth } = await supabase.auth.getUser();

  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const permit = await getPermit(id);

  if (!permit) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [stages, endorsements, photos, documents] = await Promise.all([
    getPermitStages(id),
    getEndorsements(id),
    getPhotos(id),
    getPermitDocuments(id),
  ]);

  const bucket = STORAGE_BUCKET();
  const documentBucket = DOCUMENT_BUCKET();

  const photosWithBytes = await Promise.all(
    photos.map(async (photo) => {
      try {
        const { data: signed } = await supabase.storage
          .from(bucket)
          .createSignedUrl(photo.storage_path, 60);

        if (!signed?.signedUrl) {
          return photo;
        }

        const res = await fetch(signed.signedUrl);

        if (!res.ok) {
          return photo;
        }

        const buf = new Uint8Array(await res.arrayBuffer());
        const mime = res.headers.get("content-type") || "image/jpeg";

        return {
          ...photo,
          bytes: buf,
          mime,
        };
      } catch {
        return photo;
      }
    }),
  );

  const documentsWithSignedUrls = await Promise.all(
    documents.map(async (document) => {
      try {
        const { data: signed } = await supabase.storage
          .from(documentBucket)
          .createSignedUrl(document.storage_path, 60);

        return {
          ...document,
          signedUrl: signed?.signedUrl,
        };
      } catch {
        return document;
      }
    }),
  );

  const origin =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3000";

  const publicPermitUrl = `${origin}/public/permits/${permit.id}`;

  const pdfBytes = await generatePermitPdf({
    permit,
    stages,
    endorsements,
    photos: photosWithBytes,
    documents: documentsWithSignedUrls,
    publicPermitUrl,
  });

  return new NextResponse(new Uint8Array(pdfBytes).buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${permit.serial_no}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}