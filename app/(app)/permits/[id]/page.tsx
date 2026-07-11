import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { getPermit } from "@/lib/permits/queries";
import {
  createServerSupabase,
  createServiceRoleSupabase,
} from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { PermitStatusBadge } from "@/components/permit/status-badge";
import { PermitDetail } from "@/components/permit/permit-detail";
import { DOCUMENT_BUCKET, STORAGE_BUCKET } from "@/lib/supabase/env";
import type {
  PermitDocumentRow,
  PermitEndorsementRow,
  PermitPhotoRow,
  PermitStageRow,
} from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export default async function PermitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await requireUser();

  /**
   * Important:
   * getPermit() uses the logged-in user session / RLS.
   * If this returns null, the user is NOT allowed to open this permit.
   *
   * After this passes, child rows are fetched using service role so stages,
   * photos, documents, and endorsements are consistent across Foreman,
   * Safety Assessor, SRM, and Admin.
   */
  const permit = await getPermit(id);

  if (!permit) {
    notFound();
  }

  const service = createServiceRoleSupabase();

  const [
    { data: stagesData, error: stagesError },
    { data: endorsementsData, error: endorsementsError },
    { data: photosData, error: photosError },
    { data: documentsData, error: documentsError },
  ] = await Promise.all([
    service
      .from("permit_stages")
      .select("*")
      .eq("permit_id", id)
      .order("submitted_at", { ascending: true }),

    service
      .from("permit_endorsements")
      .select("*")
      .eq("permit_id", id)
      .order("day_number", { ascending: true }),

    service
      .from("permit_photos")
      .select(
        "id, permit_id, storage_path, annotation_data, uploaded_by, uploaded_at",
      )
      .eq("permit_id", id)
      .order("uploaded_at", { ascending: true }),

    service
      .from("permit_documents")
      .select("*")
      .eq("permit_id", id)
      .order("created_at", { ascending: true }),
  ]);

  if (stagesError) {
    throw stagesError;
  }

  if (endorsementsError) {
    throw endorsementsError;
  }

  if (photosError) {
    throw photosError;
  }

  if (documentsError) {
    throw documentsError;
  }

  const stages = (stagesData ?? []) as PermitStageRow[];
  const endorsements = (endorsementsData ?? []) as PermitEndorsementRow[];
  const photos = (photosData ?? []) as PermitPhotoRow[];
  const documents = (documentsData ?? []) as PermitDocumentRow[];

  const supabase = await createServerSupabase();

  const photoBucket = STORAGE_BUCKET();
  const documentBucket = DOCUMENT_BUCKET();

  const signedPhotos = await Promise.all(
    photos.map(async (photo) => {
      const { data } = await service.storage
        .from(photoBucket)
        .createSignedUrl(photo.storage_path, 60 * 60);

      return {
        ...photo,
        signedUrl: data?.signedUrl ?? "",
      };
    }),
  );

  const signedDocuments = await Promise.all(
    documents.map(async (document) => {
      const { data } = await service.storage
        .from(documentBucket)
        .createSignedUrl(document.storage_path, 60 * 60);

      return {
        ...document,
        signedUrl: data?.signedUrl ?? "",
      };
    }),
  );

  /**
   * Keep this call so Supabase session cookies stay fresh on the page.
   */
  await supabase.auth.getUser();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link
          href="/permits"
          className="mb-2 inline-flex items-center text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to permits
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {permit.serial_no}
            </h1>

            <div className="mt-1 flex flex-wrap items-center gap-2">
              <PermitStatusBadge state={permit.state} />

              <span className="text-sm text-slate-500">
                {permit.vessel_project} • {permit.location_of_work}
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            <a
              href={`/api/permits/${permit.id}/pdf`}
              target="_blank"
              rel="noreferrer"
            >
              <Button variant="secondary">
                <Printer className="h-4 w-4" /> Print PDF
              </Button>
            </a>
          </div>
        </div>
      </div>

      <PermitDetail
        currentUser={user}
        permit={permit}
        stages={stages}
        endorsements={endorsements}
        photos={signedPhotos}
        documents={signedDocuments}
        bucket={photoBucket}
        documentBucket={documentBucket}
      />
    </div>
  );
}

export function PermitMetaCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>

      <CardBody>{children}</CardBody>
    </Card>
  );
}