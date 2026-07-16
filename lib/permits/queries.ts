import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import type {
  PermitDocumentRow,
  PermitEndorsementRow,
  PermitPhotoRow,
  PermitRow,
  PermitStageRow,
  PermitWithJoins,
} from "@/lib/supabase/types";

const PERMIT_WITH_JOINS = `
  *,
  applicant:applicant_id ( id, full_name, department, email ),
  assessor:assessor_id ( id, full_name, department, email ),
  srm:srm_id ( id, full_name, department, email ),
  closer:closer_id ( id, full_name, department, email ),
  company:company_id ( id, code, name ),
  site:site_id ( id, code, name )
`;

export async function listPermits(opts?: {
  state?: PermitRow["state"][];
  applicantId?: string;
  limit?: number;
}): Promise<PermitWithJoins[]> {
  const supabase = await createServerSupabase();

  let q = supabase
    .from("permits")
    .select(PERMIT_WITH_JOINS)
    .order("created_at", {
      ascending: false,
    });

  if (opts?.state?.length) {
    q = q.in("state", opts.state);
  }

  if (opts?.applicantId) {
    q = q.eq("applicant_id", opts.applicantId);
  }

  if (opts?.limit) {
    q = q.limit(opts.limit);
  }

  const { data, error } = await q;

  if (error) {
    throw error;
  }

  return (data ?? []) as unknown as PermitWithJoins[];
}

export async function getPermit(id: string): Promise<PermitWithJoins | null> {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase
    .from("permits")
    .select(PERMIT_WITH_JOINS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as unknown as PermitWithJoins) ?? null;
}

export async function getPermitStages(
  permitId: string,
): Promise<PermitStageRow[]> {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase
    .from("permit_stages")
    .select("*")
    .eq("permit_id", permitId)
    .order("submitted_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as PermitStageRow[];
}

export async function getEndorsements(
  permitId: string,
): Promise<PermitEndorsementRow[]> {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase
    .from("permit_endorsements")
    .select("*, endorser:endorser_id ( full_name )")
    .eq("permit_id", permitId)
    .order("day_number", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as unknown as PermitEndorsementRow[];
}

export async function getPhotos(permitId: string): Promise<PermitPhotoRow[]> {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase
    .from("permit_photos")
    .select(
      "id, permit_id, storage_path, annotation_data, uploaded_by, uploaded_at, caption",
    )
    .eq("permit_id", permitId)
    .order("uploaded_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as PermitPhotoRow[];
}

export async function getPermitDocuments(
  permitId: string,
): Promise<PermitDocumentRow[]> {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase
    .from("permit_documents")
    .select("*")
    .eq("permit_id", permitId)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as PermitDocumentRow[];
}

export async function getCompaniesAndSites() {
  const supabase = await createServerSupabase();

  const [{ data: companies, error: companiesError }, { data: sites, error: sitesError }] =
    await Promise.all([
      supabase
        .from("companies")
        .select("*")
        .eq("active", true)
        .order("code", { ascending: true }),

      supabase
        .from("sites")
        .select("*")
        .eq("active", true)
        .order("code", { ascending: true }),
    ]);

  if (companiesError) {
    throw companiesError;
  }

  if (sitesError) {
    throw sitesError;
  }

  return {
    companies: companies ?? [],
    sites: sites ?? [],
  };
}