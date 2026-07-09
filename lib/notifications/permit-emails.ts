import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmailNotification } from "./email";

type PermitEmailEvent =
  | "stage1_submitted"
  | "stage2_fit"
  | "stage2_not_fit"
  | "stage3_approved"
  | "stage3_rejected"
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
  return `${appUrl()}/public/permits/${permitId}`;
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
    stage1_submitted: "Stage I Submitted",
    stage2_fit: "Stage II Endorsed Fit",
    stage2_not_fit: "Stage II Marked Not Fit",
    stage3_approved: "Stage III Approved",
    stage3_rejected: "Stage III Rejected",
    stage4_closed: "Stage IV Closed",
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

function groupEmailsForCompany(company: CompanyRow | null) {
  if (!company) return [];

  if (company.code === "FOI") {
    return ["epermit@franklin.com.sg"];
  }

  if (company.code === "CFE") {
    return ["epermit@cfe.com.sg"];
  }

  return [];
}

async function getRecipients(
  supabase: SupabaseClient,
  permit: PermitRow,
  event: PermitEmailEvent,
) {
  if (event === "stage1_submitted") {
    return getSiteRoleUsers(supabase, permit, ["assessor"]);
  }

  if (event === "stage2_fit") {
    return getSiteRoleUsers(supabase, permit, ["srm"]);
  }

  if (event === "stage2_not_fit") {
    return getUsersByIds(
      supabase,
      [permit.applicant_id].filter(Boolean) as string[],
    );
  }

  if (event === "stage3_approved" || event === "stage3_rejected") {
    const directUsers = await getUsersByIds(
      supabase,
      [permit.applicant_id, permit.assessor_id, permit.srm_id].filter(
        Boolean,
      ) as string[],
    );

    return directUsers;
  }

  if (event === "stage4_closed") {
    return getUsersByIds(
      supabase,
      [permit.applicant_id, permit.assessor_id, permit.srm_id].filter(
        Boolean,
      ) as string[],
    );
  }

  return [];
}

export async function notifyPermitEvent(input: NotifyPermitInput) {
  const permit = await getPermit(input.supabase, input.permitId);

  if (!permit) {
    return { skipped: true, reason: "permit_not_found" };
  }

  const company = await getCompany(input.supabase, permit.company_id);
  const recipients = await getRecipients(input.supabase, permit, input.event);

  const groupEmails =
    input.event === "stage1_submitted" ||
    input.event === "stage2_fit" ||
    input.event === "stage3_approved" ||
    input.event === "stage3_rejected"
      ? groupEmailsForCompany(company)
      : [];

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