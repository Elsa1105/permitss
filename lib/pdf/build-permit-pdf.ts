import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getEndorsements,
  getPermit,
  getPermitDocuments,
  getPermitStages,
  getPhotos,
} from "@/lib/permits/queries";
import { generatePermitPdf } from "@/lib/pdf/generate-permit-pdf";
import { DOCUMENT_BUCKET, STORAGE_BUCKET } from "@/lib/supabase/env";

/**
 * Builds the full endorsed-permit PDF for a given permit id.
 *
 * Used by:
 *  - app/api/permits/[id]/pdf/route.ts (authenticated, in-app download/view)
 *  - app/api/public/permits/[id]/pdf/route.ts (no-auth, QR-code verification)
 *
 * `supabase` should be a service-role client when called from the public
 * (no-auth) route, since photo/document signed URLs and the users lookup
 * must succeed regardless of who is viewing the QR-scanned record.
 */
export async function buildPermitPdfBytes(
  supabase: SupabaseClient,
  permitId: string,
): Promise<{ bytes: Uint8Array; serialNo: string } | null> {
  const permit = await getPermit(permitId, supabase);

  if (!permit) {
    return null;
  }

  const [stages, endorsements, photos, documents] = await Promise.all([
    getPermitStages(permitId, supabase),
    getEndorsements(permitId, supabase),
    getPhotos(permitId, supabase),
    getPermitDocuments(permitId, supabase),
  ]);

  const bucket = STORAGE_BUCKET();
  const documentBucket = DOCUMENT_BUCKET();

  const uploaderIds = Array.from(
    new Set(photos.map((p) => p.uploaded_by).filter(Boolean)),
  );

  let uploaderNames = new Map<string, string>();

  if (uploaderIds.length > 0) {
    const { data: uploaders } = await supabase
      .from("users")
      .select("id, full_name")
      .in("id", uploaderIds);

    uploaderNames = new Map(
      (uploaders ?? []).map((u) => [u.id, u.full_name ?? "—"]),
    );
  }

  const photosWithBytes = await Promise.all(
    photos.map(async (photo) => {
      const uploaderName = uploaderNames.get(photo.uploaded_by);

      try {
        const { data: signed } = await supabase.storage
          .from(bucket)
          .createSignedUrl(photo.storage_path, 60);

        if (!signed?.signedUrl) {
          return { ...photo, uploaderName };
        }

        const res = await fetch(signed.signedUrl);

        if (!res.ok) {
          return { ...photo, uploaderName };
        }

        const buf = new Uint8Array(await res.arrayBuffer());
        const mime = res.headers.get("content-type") || "image/jpeg";

        return { ...photo, bytes: buf, mime, uploaderName };
      } catch {
        return { ...photo, uploaderName };
      }
    }),
  );

  const documentsWithSignedUrls = await Promise.all(
    documents.map(async (document) => {
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

  // QR must open the endorsed PDF directly (no login, no intermediate page),
  // per client requirement: "When a QR code is scanned, the endorsed PDF
  // record should be displayed directly without requiring login."
  const publicPermitUrl = `${origin}/api/public/permits/${permit.id}/pdf`;

  const pdfBytes = await generatePermitPdf({
    permit,
    stages,
    endorsements,
    photos: photosWithBytes,
    documents: documentsWithSignedUrls,
    publicPermitUrl,
  });

  return { bytes: pdfBytes, serialNo: permit.serial_no };
}
