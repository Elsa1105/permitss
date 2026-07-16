// Hand-maintained DB row types matching the migrations in /supabase/migrations.
// Re-generate with `supabase gen types typescript` once the project is stable.

export type UserRole =
  | "applicant"
  | "guest_applicant"
  | "contractor"
  | "assessor"
  | "srm"
  | "admin";

export type PermitState =
  | "draft"
  | "pending_safety_assessment"
  | "not_fit"
  | "pending_srm_approval"
  | "rejected"
  | "approved_active"
  | "pending_daily_endorsement"
  | "revoked"
  | "pending_closure"
  | "closed_completed"
  | "expired";

export type PermitStageLabel = "I" | "II" | "III" | "IV";

export type EndorsementAction = "continue" | "reject" | "revoke";

export type AuditAction =
  | "created"
  | "created_by_guest_applicant"
  | "user_created"
  | "submitted"
  | "fit"
  | "not_fit"
  | "approved"
  | "rejected"
  | "revoked"
  | "endorsed_continue"
  | "endorsed_reject"
  | "endorsed_revoke"
  | "closed"
  | "expired"
  | "photo_added"
  | "photo_removed"
  | "document_added"
  | "document_removed"
  | "permit_updated"
  | "user_updated"
  | "user_activated"
  | "user_deactivated"
  | "user_site_role_added"
  | "user_site_role_updated"
  | "user_site_role_removed";

export type Qualification =
  | "hot_work_applicant"
  | "hot_work_assessor"
  | "hot_work_srm";

export interface UserRow {
  id: string;
  email: string;
  full_name: string;
  department: string | null;
  role: UserRole;
  qualified_for: string[];
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CompanyRow {
  id: string;
  code: string;
  name: string;
  active: boolean;
  created_at: string;
}

export interface SiteRow {
  id: string;
  company_id: string;
  code: string;
  name: string;
  active: boolean;
  created_at: string;
}

export interface UserSiteRoleRow {
  id: string;
  user_id: string;
  company_id: string;
  site_id: string;
  role: UserRole;
  active: boolean;
  created_at: string;
}

export interface PermitRow {
  id: string;
  serial_no: string;
  permit_type: string;
  company_id: string | null;
  site_id: string | null;
  state: PermitState;

  display_applicant_name: string | null;
  display_applicant_department: string | null;
  job_type: string | null;

  vessel_project: string;
  location_of_work: string;
  date_commencement: string;
  date_completion: string;
  description: string;
  hazard_types: string[];
  other_hazard_text: string | null;
  contractor: string;

  contractor_company: string | null;
  contractor_supervisor_name: string | null;
  contractor_supervisor_registration_no: string | null;
  worker_briefing_acknowledged: boolean;
  top_controls_summary: string | null;

  applicant_id: string;
  assessor_id: string | null;
  srm_id: string | null;
  closer_id: string | null;

  created_at: string;
  updated_at: string;
}

export interface PermitStageRow {
  id: string;
  permit_id: string;
  stage: PermitStageLabel;
  user_id: string;
  data: Record<string, unknown>;
  submitted_at: string;
}

export interface PermitEndorsementRow {
  id: string;
  permit_id: string;
  day_number: number;
  endorser_id: string;
  action: EndorsementAction;
  remarks: string | null;
  ts: string;
  /** Scheduled day this endorsement was due (date_commencement + day_number - 1). */
  target_date?: string | null;
  /** True when submitted after target_date — a missed day caught up late. */
  retrospective?: boolean;
  /** Joined for read-only / public display only. Not present on every query. */
  endorser?: { full_name: string } | null;
}

export interface PermitPhotoRow {
  id: string;
  permit_id: string;
  storage_path: string;
  annotation_data: Record<string, unknown> | null;
  uploaded_by: string;
  uploaded_at: string;
  /** Optional written comment from the uploader (e.g. why marked Not Fit). */
  caption?: string | null;
}

export interface PermitDocumentRow {
  id: string;
  permit_id: string;
  uploaded_by: string;
  document_type:
    | "risk_assessment"
    | "jsa"
    | "method_statement"
    | "gas_test_record"
    | "other";
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  file_size: number | null;
  created_at: string;
}

export interface AuditLogRow {
  id: number;
  permit_id: string | null;
  actor_id: string | null;
  action: AuditAction;
  from_state: PermitState | null;
  to_state: PermitState | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  ts: string;
}

export interface PermitWithJoins extends PermitRow {
  applicant: Pick<UserRow, "id" | "full_name" | "department" | "email"> | null;
  assessor: Pick<UserRow, "id" | "full_name" | "department" | "email"> | null;
  srm: Pick<UserRow, "id" | "full_name" | "department" | "email"> | null;
  closer: Pick<UserRow, "id" | "full_name" | "department" | "email"> | null;

  company: Pick<CompanyRow, "id" | "code" | "name"> | null;
  site: Pick<SiteRow, "id" | "code" | "name"> | null;
}