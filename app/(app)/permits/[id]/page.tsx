import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import {
  getEndorsements,
  getPermit,
  getPermitDocuments,
  getPermitStages,
  getPhotos,
} from "@/lib/permits/queries";
import { createServerSupabase } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { PermitStatusBadge } from "@/components/permit/status-badge";
import { PermitDetail } from "@/components/permit/permit-detail";
import { DOCUMENT_BUCKET, STORAGE_BUCKET } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

export default async function PermitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await requireUser();
  const permit = await getPermit(id);

  if (!permit) {
    notFound();
  }

  const [stages, endorsements, photos, documents] = await Promise.all([
    getPermitStages(id),
    getEndorsements(id),
    getPhotos(id),
    getPermitDocuments(id),
  ]);

  const supabase = await createServerSupabase();

  const photoBucket = STORAGE_BUCKET();
  const documentBucket = DOCUMENT_BUCKET();

  const signedPhotos = await Promise.all(
    photos.map(async (photo) => {
      const { data } = await supabase.storage
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
      const { data } = await supabase.storage
        .from(documentBucket)
        .createSignedUrl(document.storage_path, 60 * 60);

      return {
        ...document,
        signedUrl: data?.signedUrl ?? "",
      };
    }),
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <Link
          href="/permits"
          className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700 mb-2"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to permits
        </Link>

        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {permit.serial_no}
            </h1>

            <div className="flex items-center gap-2 mt-1 flex-wrap">
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