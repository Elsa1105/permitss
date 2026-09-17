import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmailNotification } from "./email";

/* ================= TYPES ================= */

type PermitEmailEvent =
  | "stage1_submitted"
  | "stage2_fit"
  | "stage2_not_fit"
  | "stage3_approved"
  | "stage3_rejected"
  | "daily_endorsement"
  | "daily_endorsement_reminder"
  | "stage4_closed"
  | "closure_reminder";

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

/* ================= UTIL ================= */

function normalizeRole(role?: string | null) {
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
    .maybeSingle(); // ✅ FIX (no crash)

  if (error) {
    console.error("getCompany ERROR:", error);
    return null;
  }

  return data as CompanyRow | null;
}

/* ================= USERS ================= */

async function getAssignedUsers(
  supabase: SupabaseClient,
  permit: PermitRow
) {
  const ids = [
    permit.applicant_id,
    permit.assessor_id,
    permit.srm_id,
  ].filter(Boolean);

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

function filterByRole(users: UserRow[], role: string) {
  return users.filter(
    (u) => normalizeRole(u.role) === role && u.email
  );
}

/* ================= ROLE → EVENT ================= */

function resolveRolesByEvent(event: PermitEmailEvent): string[] {
  switch (event) {
    case "daily_endorsement_reminder":
      return ["srm"];

    case "closure_reminder":
      return ["applicant"];

    default:
      return ["applicant", "assessor", "srm"];
  }
}

/* ================= GROUP EMAIL ================= */

function getGroupEmails(company: CompanyRow | null) {
  if (!company) return [];

  if (company.code === "CFE") {
    return [
      "srm@cfe.com.sg",
      "assessor@cfe.com.sg",
      "foreman@cfe.com.sg",
    ];
  }

  if (company.code === "FOI") {
    return [
      "srm@franklin.com.sg",
      "assessor@franklin.com.sg",
    ];
  }

  return [];
}

/* ================= EMAIL ================= */

function eventLabel(e: PermitEmailEvent) {
  return {
    stage1_submitted: "Permit Submitted",
    stage2_fit: "Fit To Work",
    stage2_not_fit: "Not Fit",
    stage3_approved: "Approved",
    stage3_rejected: "Rejected",
    daily_endorsement: "Daily Endorsement",
    daily_endorsement_reminder: "Daily Endorsement Reminder",
    stage4_closed: "Completed",
    closure_reminder: "Closure Reminder",
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
    console.warn("⚠️ company missing, fallback to users only");
  }

  const assignedUsers = await getAssignedUsers(input.supabase, permit);
  const targetRoles = resolveRolesByEvent(input.event);
  const groupEmails = getGroupEmails(company);

  const roleToGroup: Record<string, string> = {
    applicant: "foreman",
    assessor: "assessor",
    srm: "srm",
  };

  let emails: string[] = [];

  for (const role of targetRoles) {
    const users = filterByRole(assignedUsers, role);

    // ✅ ALWAYS include assigned users
    emails.push(...users.map((u) => u.email!));

    // ✅ GROUP LOGIC
    if (company?.code === "CFE") {
      const groupKey = roleToGroup[role];
      const group = groupEmails.find((g) =>
        g.toLowerCase().includes(groupKey)
      );
      if (group) emails.push(group);
    }

    if (company?.code === "FOI") {
      if (role !== "applicant") {
        const groupKey = roleToGroup[role];
        const group = groupEmails.find((g) =>
          g.toLowerCase().includes(groupKey)
        );
        if (group) emails.push(group);
      }
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