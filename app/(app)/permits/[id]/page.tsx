import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import {
  getEndorsements,
  getPermit,
  getPermitStages,
  getPhotos,
} from "@/lib/permits/queries";
import { createServerSupabase } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { PermitStatusBadge } from "@/components/permit/status-badge";
import { PermitDetail } from "@/components/permit/permit-detail";
import { STORAGE_BUCKET } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

export default async function PermitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const permit = await getPermit(id);
  if (!permit) notFound();

  const [stages, endorsements, photos] = await Promise.all([
    getPermitStages(id),
    getEndorsements(id),
    getPhotos(id),
  ]);

  // Sign URLs for photos (server-side, short-lived)
  const supabase = await createServerSupabase();
  const bucket = STORAGE_BUCKET();
  const signedPhotos = await Promise.all(
    photos.map(async (p) => {
      const { data } = await supabase.storage
        .from(bucket)
        .createSignedUrl(p.storage_path, 60 * 60);
      return { ...p, signedUrl: data?.signedUrl ?? "" };
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
            <div className="flex items-center gap-2 mt-1">
              <PermitStatusBadge state={permit.state} />
              <span className="text-sm text-slate-500">
                {permit.vessel_project} • {permit.location_of_work}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <a href={`/api/permits/${permit.id}/pdf`} target="_blank" rel="noreferrer">
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
        bucket={bucket}
      />
    </div>
  );
}

// Light wrapper card so the loading state has a recognizable shell.
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
