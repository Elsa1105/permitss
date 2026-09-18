import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmailNotification } from "./email";

/* ================= TYPES ================= */

// NOTE: daily_endorsement_reminder / closure_reminder are handled by
// lib/notifications/daily-reminders.ts (via the /api/cron/* routes),
// NOT by this file.
type PermitEmailEvent =
  | "stage1_submitted"
  | "stage2_fit"
  | "stage2_not_fit"
  | "stage3_approved"
  | "stage3_rejected"
  | "daily_endorsement"
  | "stage4_closed";

type NotifyPermitInput = {
  supabase: SupabaseClient;
  permitId: string;
  event: PermitEmailEvent;
  note?: string;
};

type PermitRow = {
  id: string;
  serial_no: string;
  state: string;
  job_type: string | null;
  vessel_project: string;
  location_of_work: string;
  description: string;
  company_id: string | null;
  site_id: string | null;
  applicant_id: string | null;
  assessor_id: string | null;
  srm_id: string | null;
};

type UserRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string | null;
};

type CompanyRow = {
  id: string;
  code: string;
  name: string;
};

type Role = "applicant" | "assessor" | "srm";

/* ================= UTIL ================= */

function normalizeRole(role?: string | null): Role | "" {
  const r = role?.toLowerCase() || "";

  if (r.includes("applicant") || r.includes("foreman")) return "applicant";
  if (r.includes("assessor")) return "assessor";
  if (r.includes("srm")) return "srm";

  return "";
}

function uniqueEmails(list: string[]) {
  return Array.from(new Set(list.map((e) => e.toLowerCase().trim())));
}

/* ================= DB ================= */

async function getPermit(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase
    .from("permits")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error("getPermit ERROR:", error);
    return null;
  }

  return data as PermitRow;
}

async function getCompany(supabase: SupabaseClient, id: string | null) {
  if (!id) return null;

  const { data, error } = await supabase
    .from("companies")
    .select("id, code, name")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("getCompany ERROR:", error);
    return null;
  }

  return data as CompanyRow | null;
}

/**
 * Users directly assigned on the permit row itself (applicant_id /
 * assessor_id / srm_id). These are always included — the specific person
 * tied to this permit must always be notified, regardless of the "group"
 * logic below.
 */
async function getAssignedUsers(supabase: SupabaseClient, permit: PermitRow) {
  const ids = [permit.applicant_id, permit.assessor_id, permit.srm_id].filter(
    Boolean,
  ) as string[];

  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("users")
    .select("id, email, full_name, role")
    .in("id", ids);

  if (error) {
    console.error("getAssignedUsers ERROR:", error);
    return [];
  }

  return data as UserRow[];
}

/**
 * "Group" email — computed directly from Supabase, not from an Outlook
 * distribution list. This is every ACTIVE user in `users` whose
 * company_id matches the permit's company AND whose role matches the
 * target role.
 *
 * This is intentionally the ENTIRE role+company pool, not just the one
 * person assigned to the permit — that's what makes it behave like a
 * "group" (everyone in that role for that company gets notified),
 * matching Alex's spec (srm@franklin.com.sg / assessor@franklin.com.sg /
 * srm@cfe.com.sg / assessor@cfe.com.sg / foreman@cfe.com.sg) without
 * needing a real DL address.
 */
async function getCompanyRoleGroup(
  supabase: SupabaseClient,
  companyId: string | null,
  role: Role,
) {
  if (!companyId) return [];

  const { data, error } = await supabase
    .from("users")
    .select("id, email, full_name, role")
    .eq("company_id", companyId)
    .eq("active", true);

  if (error) {
    console.error("getCompanyRoleGroup ERROR:", error);
    return [];
  }

  return ((data ?? []) as UserRow[]).filter(
    (u) => normalizeRole(u.role) === role && u.email,
  );
}

function filterByRole(users: UserRow[], role: Role) {
  return users.filter((u) => normalizeRole(u.role) === role && u.email);
}

/* ================= ROLE → EVENT ================= */

/**
 * Per Alex's workflow table:
 *   Stage 1 (submitted), Stage 2 (fit / not fit), Stage 3 (approved /
 *   rejected) → Applicant + Assessor + SRM, every time.
 *   daily_endorsement (manual endorsement action, NOT the 0900 cron
 *   reminder — that's daily-reminders.ts) → SRM + Assessor, since the
 *   applicant has no action to take on a daily endorsement.
 *   stage4_closed → Applicant + Assessor + SRM (closure confirmation).
 */
function resolveRolesByEvent(event: PermitEmailEvent): Role[] {
  switch (event) {
    case "daily_endorsement":
      return ["assessor", "srm"];
    default:
      return ["applicant", "assessor", "srm"];
  }
}

/**
 * Per Alex's spec (Image 2):
 *   - FOI applicant/foreman → INDIVIDUAL only, never the company-wide group
 *     ("Individual addressing supports permit-owner traceability").
 *   - Every other combination (FOI srm/assessor, CFE all three roles) →
 *     group behaviour (assigned user + everyone else in that role/company).
 */
function shouldUseGroup(companyCode: string | undefined, role: Role) {
  if (companyCode === "FOI" && role === "applicant") return false;
  return true;
}

/* ================= EMAIL CONTENT ================= */

function eventLabel(e: PermitEmailEvent) {
  return {
    stage1_submitted: "Permit Submitted",
    stage2_fit: "Fit To Work",
    stage2_not_fit: "Not Fit",
    stage3_approved: "Approved",
    stage3_rejected: "Rejected",
    daily_endorsement: "Daily Endorsement",
    stage4_closed: "Completed",
  }[e];
}

function buildSubject(p: PermitRow, e: PermitEmailEvent) {
  return `[ePermit] ${p.serial_no} - ${eventLabel(e)}`;
}

function permitUrl(id: string) {
  return `${process.env.NEXT_PUBLIC_APP_URL}/permits/${id}`;
}

/* ================= MAIN ================= */

export async function notifyPermitEvent(input: NotifyPermitInput) {
  const permit = await getPermit(input.supabase, input.permitId);

  if (!permit) {
    console.error("❌ PERMIT NOT FOUND", input.permitId);
    return;
  }

  const company = await getCompany(input.supabase, permit.company_id);

  if (!company) {
    console.warn("⚠️ company missing on permit, notifications will use assigned users only");
  }

  const assignedUsers = await getAssignedUsers(input.supabase, permit);
  const targetRoles = resolveRolesByEvent(input.event);

  let emails: string[] = [];

  for (const role of targetRoles) {
    // 1) Always include whoever is actually assigned on the permit
    //    (applicant_id / assessor_id / srm_id) for this role.
    const assigned = filterByRole(assignedUsers, role);
    emails.push(...assigned.map((u) => u.email!));

    // 2) If this role+company should behave as a group (everything
    //    except FOI applicant/foreman), also pull in every other active
    //    user of that role for that company — this is the "group" / "CC"
    //    behaviour, computed live from Supabase instead of a fixed DL.
    if (shouldUseGroup(company?.code, role)) {
      const groupUsers = await getCompanyRoleGroup(
        input.supabase,
        permit.company_id,
        role,
      );
      emails.push(...groupUsers.map((u) => u.email!));
    }
  }

  emails = uniqueEmails(emails);

  console.log("📧 FINAL RECIPIENTS", {
    permit: permit.serial_no,
    event: input.event,
    company: company?.code,
    emails,
  });

  if (!emails.length) {
    console.log("NO RECIPIENT");
    return;
  }

  return sendEmailNotification({
    to: emails,
    subject: buildSubject(permit, input.event),

    html: `
      <h2>${eventLabel(input.event)}</h2>
      <p><b>Permit:</b> ${permit.serial_no}</p>
      <p><b>Status:</b> ${permit.state}</p>
      <p><b>Location:</b> ${permit.location_of_work}</p>
      <p><b>Description:</b> ${permit.description}</p>
      ${input.note ? `<p><b>Note:</b> ${input.note}</p>` : ""}

      <br/>

      <a href="${permitUrl(permit.id)}">
         Open Permit
      </a>
    `,

    text: `
${eventLabel(input.event)}
Permit: ${permit.serial_no}
Status: ${permit.state}
Location: ${permit.location_of_work}
Description: ${permit.description}
${input.note ? `Note: ${input.note}` : ""}
    `,
  });
}
