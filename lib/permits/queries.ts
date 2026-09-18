import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import type {
  PermitDocumentRow,
  PermitEndorsementRow,
  PermitPhotoRow,
  PermitRow,
  PermitStageRow,
  PermitWithJoins,
} from "@/lib/supabase/types";
import { createServiceRoleSupabase } from "@/lib/supabase/server";

const PERMIT_WITH_JOINS = `
  *,
  applicant:applicant_id (id, full_name, department, email),
  assessor:assessor_id (id, full_name, department, email),
  srm:srm_id (id, full_name, department, email),
  closer:closer_id (id, full_name, department, email),
  site:site_id (
    id,
    code,
    name,
    company:company_id (
      id,
      code,
      name
    )
  )
`;

export async function listPermits(opts?: {
  state?: PermitRow["state"][];
  applicantId?: string;
  companyId?: string;
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

  // companyId scopes to every permit raised for that company (e.g. all CFE
  // permits), regardless of who the applicant was. Takes priority over
  // applicantId, which scopes to a single user's own permits.
  if (opts?.companyId) {
  const { data: sites } = await supabase
    .from("sites")
    .select("id")
    .eq("company_id", opts.companyId);

  const siteIds = (sites ?? []).map((s) => s.id);

  q = q.in("site_id", siteIds);
  } else if (opts?.applicantId) {
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

export async function getPermit(
  id: string,
  client?: SupabaseClient,
): Promise<PermitWithJoins | null> {
  const supabase = client ?? (await createServerSupabase());

  const { data, error } = await supabase
    .from("permits")
    .select(PERMIT_WITH_JOINS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
  console.error("SUPABASE ERROR:", error);
  throw new Error(error.message);
}

  return (data as unknown as PermitWithJoins) ?? null;
}

export async function getPermitStages(
  permitId: string,
  client?: SupabaseClient,
): Promise<PermitStageRow[]> {
  const supabase = client ?? (await createServerSupabase());

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
  client?: SupabaseClient,
): Promise<PermitEndorsementRow[]> {
  const supabase = client ?? (await createServerSupabase());

  const { data, error } = await supabase
    .from("permit_endorsements")
    .select("*")
    .eq("permit_id", permitId)
    .order("day_number", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as PermitEndorsementRow[];
}

export async function getPhotos(
  permitId: string,
  client?: SupabaseClient,
): Promise<PermitPhotoRow[]> {
  const supabase = client ?? (await createServerSupabase());

  const { data, error } = await supabase
    .from("permit_photos")
    .select(
      "id, permit_id, storage_path, annotation_data, caption, uploaded_by, uploaded_at",
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
  client?: SupabaseClient,
): Promise<PermitDocumentRow[]> {
  const supabase = client ?? (await createServerSupabase());

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


export async function getCompaniesAndSites(userId: string, userRole?: string) {
  const supabase = createServiceRoleSupabase();

  // Admins may access both entities where necessary (per Alex's spec:
  // "Selected Admin and Assessor roles may access both entities where
  // necessary") — so admins always see every active company/site,
  // regardless of what's in their own user_site_roles rows.
  if (userRole === "admin") {
    const { data: allCompanies, error: companiesError } = await supabase
      .from("companies")
      .select("*")
      .eq("active", true);

    if (companiesError) throw companiesError;

    const { data: allSites, error: sitesError } = await supabase
      .from("sites")
      .select("*")
      .eq("active", true);

    if (sitesError) throw sitesError;

    return {
      companies: allCompanies ?? [],
      sites: allSites ?? [],
    };
  }

  const { data: roles, error } = await supabase
    .from("user_site_roles")
    .select("company_id, site_id")
    .eq("user_id", userId)
    .eq("active", true);

  if (error) throw error;

  const companyIds = [
    ...new Set((roles ?? []).map((r) => r.company_id).filter(Boolean)),
  ];
  const siteIds = [
    ...new Set((roles ?? []).map((r) => r.site_id).filter(Boolean)),
  ];

  if (companyIds.length === 0) {
    return { companies: [], sites: [] };
  }

  const { data: companies } = await supabase
    .from("companies")
    .select("*")
    .in("id", companyIds)
    .eq("active", true);

  let sitesData = [];

  if (siteIds.length > 0) {
    const { data } = await supabase
      .from("sites")
      .select("*")
      .in("id", siteIds)
      .eq("active", true);

    sitesData = data ?? [];
  } else {
    const { data } = await supabase
      .from("sites")
      .select("*")
      .in("company_id", companyIds)
      .eq("active", true);

    sitesData = data ?? [];
  }

  return {
    companies: companies ?? [],
    sites: sitesData,
  };
}