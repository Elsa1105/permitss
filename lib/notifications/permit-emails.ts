import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmailNotification } from "./email";

/* ================= TYPES ================= */

// NOTE: daily_endorsement_reminder / closure_reminder are handled by
// lib/notifications/daily-reminders.ts (via the /api/cron/* routes),
// NOT by this file. They were removed from this union because nothing
// ever called notifyPermitEvent() with them — that was dead code.
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
 * assessor_id / srm_id). These are always included on top of any group
 * email, per Alex's spec: "assigned assessor" / "assigned SRM" must be
 * notified even if a group address also gets the email.
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
 * Fallback: every active user for this company + role, queried directly
 * off users.company_id (confirmed present on the real users table — no
 * need to join through user_site_roles/sites for this). Used when the
 * permit doesn't yet have someone assigned to a role (e.g. no assessor_id
 * yet at stage1_submitted) or when a role should notify everyone in that
 * role for the company, not just the one assigned person.
 */
async function getUsersByCompanyAndRole(
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
    console.error("getUsersByCompanyAndRole ERROR:", error);
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

function resolveRolesByEvent(event: PermitEmailEvent): Role[] {
  // Per Alex's workflow table (Image 1): every stage 1-3 and daily
  // endorsement notifies Applicant + Assessor + SRM together.
  switch (event) {
    default:
      return ["applicant", "assessor", "srm"];
  }
}

/* ================= GROUP EMAIL (by role + company) ================= */

/**
 * TODO: replace every address below with the REAL distribution-list
 * address from Outlook (Group Settings → the actual SMTP address, not
 * the display name) — e.g. "ePermit SRM CFE", "ePermit Assessor CFE",
 * "ePermit Foreman CFE" from the screenshot Alex sent, and their FOI
 * equivalents if those groups exist too. Until then these are
 * placeholders and notifyPermitEvent() will simply skip a group that
 * isn't found here (real assigned/individual users still get emailed
 * as a fallback, so nothing silently fails).
 */
const GROUP_EMAILS: Record<string, Partial<Record<Role, string>>> = {
  FOI: {
    srm: "srm@franklin.com.sg", // TODO: replace with real FOI SRM DL address
    assessor: "assessor@franklin.com.sg", // TODO: replace with real FOI Assessor DL address
    // FOI applicants are notified individually per Alex's spec (Image 2),
    // not via a group — intentionally no "applicant" entry here.
  },
  CFE: {
    srm: "srm@cfe.com.sg", // TODO: replace with real "ePermit SRM CFE" DL address
    assessor: "assessor@cfe.com.sg", // TODO: replace with real "ePermit Assessor CFE" DL address
    applicant: "foreman@cfe.com.sg", // TODO: replace with real "ePermit Foreman CFE" DL address
  },
};

function getGroupEmail(company: CompanyRow | null, role: Role): string | null {
  if (!company) return null;
  return GROUP_EMAILS[company.code]?.[role] ?? null;
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
    console.warn("⚠️ company missing on permit, notifications will use assigned/individual users only");
  }

  const assignedUsers = await getAssignedUsers(input.supabase, permit);
  const targetRoles = resolveRolesByEvent(input.event);

  let emails: string[] = [];

  for (const role of targetRoles) {
    // 1) Always include whoever is actually assigned on the permit
    //    (applicant_id / assessor_id / srm_id), matching that role.
    const assigned = filterByRole(assignedUsers, role);
    emails.push(...assigned.map((u) => u.email!));

    // 2) Also include the company+role group/DL address, if we have one.
    const group = getGroupEmail(company, role);
    if (group) emails.push(group);

    // 3) If nobody is assigned to this role yet AND there's no group
    //    address configured for it, fall back to every active user of
    //    that role for this company — so a permit never goes silently
    //    unnotified just because assessor_id/srm_id hasn't been set yet.
    if (assigned.length === 0 && !group) {
      const fallbackUsers = await getUsersByCompanyAndRole(
        input.supabase,
        permit.company_id,
        role,
      );
      emails.push(...fallbackUsers.map((u) => u.email!));
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
