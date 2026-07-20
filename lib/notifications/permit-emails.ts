import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmailNotification } from "./email";

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
  closer_id: string | null;
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

function appUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3000"
  );
}

function permitUrl(permitId: string) {
  return `${appUrl()}/permits/${permitId}`;
}

function publicPermitUrl(permitId: string) {
  // Opens the endorsed PDF directly (no login, no intermediate page),
  // matching the QR code target embedded in the PDF itself.
  return `${appUrl()}/api/public/permits/${permitId}/pdf`;
}

function uniqueEmails(users: UserRow[], extraEmails: string[] = []) {
  return Array.from(
    new Set(
      [
        ...users
          .map((user) => user.email)
          .filter((email): email is string => Boolean(email)),
        ...extraEmails.filter(Boolean),
      ].map((email) => email.trim().toLowerCase()),
    ),
  );
}

function eventLabel(event: PermitEmailEvent) {
  const labels: Record<PermitEmailEvent, string> = {
    stage1_submitted: "Permit Application Submitted",
    stage2_fit: "Stage II Endorsed Fit to Work",
    stage2_not_fit: "Stage II Marked Not Fit to Work",
    stage3_approved: "Approved by SRM / Project Manager",
    stage3_rejected: "Stage III Rejected by SRM / Project Manager",
    daily_endorsement: "Daily Endorsement Submitted",
    stage4_closed: "Job Completion",
  };

  return labels[event];
}

function buildSubject(permit: PermitRow, event: PermitEmailEvent) {
  return `[ePermit] ${permit.serial_no} - ${eventLabel(event)}`;
}

function buildHtml(permit: PermitRow, event: PermitEmailEvent, note?: string) {
  const label = eventLabel(event);
  const url = permitUrl(permit.id);
  const liveUrl = publicPermitUrl(permit.id);

  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #0f172a;">
      <h2 style="margin-bottom: 8px;">${escapeHtml(label)}</h2>

      <p>A Hot Work Permit has been updated in the Franklin ePermit system.</p>

      <table style="border-collapse: collapse; margin-top: 16px;">
        <tr>
          <td style="padding: 6px 12px; font-weight: bold;">Permit No.</td>
          <td style="padding: 6px 12px;">${escapeHtml(permit.serial_no)}</td>
        </tr>
        <tr>
          <td style="padding: 6px 12px; font-weight: bold;">Status</td>
          <td style="padding: 6px 12px;">${escapeHtml(permit.state)}</td>
        </tr>
        <tr>
          <td style="padding: 6px 12px; font-weight: bold;">Job Type</td>
          <td style="padding: 6px 12px;">${escapeHtml(permit.job_type || "—")}</td>
        </tr>
        <tr>
          <td style="padding: 6px 12px; font-weight: bold;">Vessel / Project</td>
          <td style="padding: 6px 12px;">${escapeHtml(permit.vessel_project)}</td>
        </tr>
        <tr>
          <td style="padding: 6px 12px; font-weight: bold;">Location</td>
          <td style="padding: 6px 12px;">${escapeHtml(permit.location_of_work)}</td>
        </tr>
        <tr>
          <td style="padding: 6px 12px; font-weight: bold;">Description</td>
          <td style="padding: 6px 12px;">${escapeHtml(permit.description)}</td>
        </tr>
      </table>

      ${
        note
          ? `<p style="margin-top: 16px;"><strong>Note:</strong> ${escapeHtml(note)}</p>`
          : ""
      }

      <p style="margin-top: 20px;">
        <a href="${url}" style="background: #0f172a; color: white; padding: 10px 14px; text-decoration: none; border-radius: 6px;">
          Open Permit
        </a>
      </p>

      <p style="margin-top: 12px; font-size: 13px; color: #64748b;">
        Public live permit display: <a href="${liveUrl}">${liveUrl}</a>
      </p>

      <p style="margin-top: 24px; font-size: 12px; color: #64748b;">
        This is an automated notification from Franklin ePermit.
      </p>
    </div>
  `;
}

function buildText(permit: PermitRow, event: PermitEmailEvent, note?: string) {
  return `
${eventLabel(event)}

Permit No.: ${permit.serial_no}
Status: ${permit.state}
Job Type: ${permit.job_type || "—"}
Vessel / Project: ${permit.vessel_project}
Location: ${permit.location_of_work}
Description: ${permit.description}
${note ? `Note: ${note}` : ""}

Open Permit:
${permitUrl(permit.id)}

Public Live Permit:
${publicPermitUrl(permit.id)}
`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function getPermit(
  supabase: SupabaseClient,
  permitId: string,
): Promise<PermitRow | null> {
  const { data, error } = await supabase
    .from("permits")
    .select(
      `
        id,
        serial_no,
        state,
        job_type,
        vessel_project,
        location_of_work,
        description,
        company_id,
        site_id,
        applicant_id,
        assessor_id,
        srm_id,
        closer_id
      `,
    )
    .eq("id", permitId)
    .single();

  if (error || !data) {
    console.error("[EMAIL] Failed to load permit", error);
    return null;
  }

  return data as PermitRow;
}

async function getCompany(
  supabase: SupabaseClient,
  companyId: string | null,
): Promise<CompanyRow | null> {
  if (!companyId) return null;

  const { data, error } = await supabase
    .from("companies")
    .select("id, code, name")
    .eq("id", companyId)
    .single();

  if (error || !data) {
    console.error("[EMAIL] Failed to load company", error);
    return null;
  }

  return data as CompanyRow;
}

async function getUsersByIds(supabase: SupabaseClient, ids: string[]) {
  const cleanIds = Array.from(new Set(ids.filter(Boolean)));

  if (!cleanIds.length) return [];

  const { data, error } = await supabase
    .from("users")
    .select("id, email, full_name, role")
    .in("id", cleanIds)
    .eq("active", true);

  if (error) {
    console.error("[EMAIL] Failed to load users by ids", error);
    return [];
  }

  return (data ?? []) as UserRow[];
}

async function getSiteRoleUsers(
  supabase: SupabaseClient,
  permit: PermitRow,
  roles: string[],
) {
  if (!permit.company_id || !permit.site_id) {
    return [];
  }

  const { data, error } = await supabase
    .from("user_site_roles")
    .select(
      `
        user:user_id (
          id,
          email,
          full_name,
          role
        )
      `,
    )
    .eq("company_id", permit.company_id)
    .eq("site_id", permit.site_id)
    .in("role", roles)
    .eq("active", true);

  if (error) {
    console.error("[EMAIL] Failed to load site role users", error);
    return [];
  }

  return (data ?? [])
    .map((row: { user?: UserRow | UserRow[] | null }) => {
      if (Array.isArray(row.user)) return row.user[0] ?? null;
      return row.user ?? null;
    })
    .filter((user): user is UserRow => Boolean(user));
}

// Group inbox addresses, per the client's 16 Jul 2026 "ePermit email
// communication" list. Each company has its own SRM/PM, Assessor, and
// Foreman/Applicant group inbox. Applicants are notified at their own
// personal email (for ease of tracing) rather than the foreman group box,
// but the group box is still CC'd for FOI/CFE-wide visibility where noted.
function groupEmailsForCompany(
  company: CompanyRow | null,
  kinds: Array<"srm" | "assessor" | "foreman">,
) {
  if (!company) return [];

  const byCompany: Record<string, Record<"srm" | "assessor" | "foreman", string>> = {
    FOI: {
      srm: "srm@franklin.com.sg",
      assessor: "assessor@franklin.com.sg",
      foreman: "foreman@franklin.com.sg",
    },
    CFE: {
      srm: "srm@cfe.com.sg",
      assessor: "assessor@cfe.com.sg",
      foreman: "foreman@cfe.com.sg",
    },
  };

  const addresses = byCompany[company.code];
  if (!addresses) return [];

  return kinds.map((kind) => addresses[kind]).filter(Boolean);
}

// Per the client's confirmed notification spec (email 10 Jun 2026 meeting
// notes, reconfirmed in the 16 Jul 2026 email communication list):
//   1. Permit application   -> applicant, assessor, srm
//   2. Fit to work          -> applicant, assessor, srm
//   3. Not Fit to Work      -> applicant, assessor, srm
//   4. Approved by SRM      -> applicant, assessor, srm
//   5. Daily Endorsement    -> applicant, assessor, srm
//   6. Job Completion       -> applicant, assessor, srm
// Every event therefore notifies the same three stakeholders. Direct
// assigned users (by id) are used where already set on the permit record;
// for stage1 (submission), the permit may not yet have an assessor/srm
// assigned, so site-scoped role holders are used as a fallback.
async function getRecipients(
  supabase: SupabaseClient,
  permit: PermitRow,
  event: PermitEmailEvent,
) {
  const directIds = [
    permit.applicant_id,
    permit.assessor_id,
    permit.srm_id,
  ].filter(Boolean) as string[];

  const directUsers = await getUsersByIds(supabase, directIds);

  // Fill in any stakeholder not yet assigned directly on the permit record
  // (e.g. no assessor_id yet at submission time) using site-scoped role
  // holders, so nobody responsible for the site is missed.
  const missingRoles: string[] = [];
  if (!permit.assessor_id) missingRoles.push("assessor");
  if (!permit.srm_id) missingRoles.push("srm");

  const fallbackUsers = missingRoles.length
    ? await getSiteRoleUsers(supabase, permit, missingRoles)
    : [];

  return [...directUsers, ...fallbackUsers];
}

export async function notifyPermitEvent(input: NotifyPermitInput) {
  const permit = await getPermit(input.supabase, input.permitId);

  if (!permit) {
    return { skipped: true, reason: "permit_not_found" };
  }

  const company = await getCompany(input.supabase, permit.company_id);
  const recipients = await getRecipients(input.supabase, permit, input.event);

  // CC all three group inboxes on every event, per the client's spec that
  // every one of the 6 notification types reaches applicant + assessor + SRM.
  // Group inboxes give visibility even if an individual's personal address
  // bounces or a role is temporarily unassigned.
  const groupEmails = groupEmailsForCompany(company, [
    "srm",
    "assessor",
    "foreman",
  ]);

  const emails = uniqueEmails(recipients, groupEmails);

  if (!emails.length) {
    console.log("[EMAIL SKIPPED] No recipients found", {
      permitId: input.permitId,
      event: input.event,
    });

    return { skipped: true, reason: "no_recipients" };
  }

  return sendEmailNotification({
    to: emails,
    subject: buildSubject(permit, input.event),
    html: buildHtml(permit, input.event, input.note),
    text: buildText(permit, input.event, input.note),
  });
}