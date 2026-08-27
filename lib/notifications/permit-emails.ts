import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmailNotification } from "./email";

/* ================= STATIC EMAIL ================= */

const STATIC_EMAILS = {
  CFE: {
    assessor: [
      "tampubolon.2305551061@student.unud.ac.id",
      "safety.assessor@franklin.example",
      "shalim@franklin.com.sg",
      "joseph.mok@franklin.com.sg",
    ],
    srm: [
      "alan.ng@cfe.com.sg",
      "samuel.tan@cfe.com.sg",
      "stephen.wong@cfe.com.sg",
      "srm@franklin.example",
    ],
    applicant: ["foreman@franklin.example"],
    admin: [
      "joshfsm@hotmail.com",
      "jon.lee@franklin.com.sg",
      "alex.lim@franklin.com.sg",
    ],
  },

  FOI: {
    assessor: [
      "elsaameliatampubolon@gmail.com",
      "ismail@franklin.com.sg",
      "joseph.mok@franklin.com.sg",
    ],
    srm: [
      "mohd.mahadir@franklin.com.sg",
      "gilbert.teo@franklin.com.sg",
      "srm@franklin.example",
    ],
    applicant: [
      "sivakumar@franklin.com.sg",
      "muru.anandan@franklin.com.sg",
      "kavi@franklin.com.sg",
      "hanliang.kwee@franklin.com.sg",
      "henry.lee@franklin.com.sg",
      "alex.toh@franklin.com.sg",
      "zengguang.liu@franklin.com.sg",
      "zuhairi@franklin.com.sg",
      "faizul@franklin.com.sg",
      "ronald.yip@franklin.com.sg",
      "kokkoon.teh@franklin.com.sg",
      "beohock.chew@franklin.com.sg",
      "akash@franklin.com.sg",
      "josh.tan@franklin.com.sg",
    ],
    admin: [
      "jon.lee@franklin.com.sg",
      "alex.lim@franklin.com.sg",
    ],
  },
};

/* ================= TYPES ================= */

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

/* ================= UTIL ================= */

function normalizeRole(role?: string | null) {
  return role?.toLowerCase().trim() || "";
}

function uniqueEmails(users: UserRow[], extra: string[] = []) {
  return Array.from(
    new Set(
      [
        ...users.map((u) => u.email).filter(Boolean),
        ...extra,
      ].map((e) => e!.toLowerCase().trim())
    )
  );
}

/* ================= DB ================= */

async function getPermit(supabase: SupabaseClient, id: string) {
  const { data } = await supabase
    .from("permits")
    .select("*")
    .eq("id", id)
    .single();

  return data as PermitRow | null;
}

async function getCompany(supabase: SupabaseClient, id: string | null) {
  if (!id) return null;

  const { data } = await supabase
    .from("companies")
    .select("id, code, name")
    .eq("id", id)
    .single();

  return data as CompanyRow | null;
}

async function getUsersByIds(supabase: SupabaseClient, ids: string[]) {
  if (!ids.length) return [];

  const { data } = await supabase
    .from("users")
    .select("id, email, full_name, role")
    .in("id", ids)
    .eq("active", true);

  return (data ?? []) as UserRow[];
}

/* ================= CORE ================= */

async function getRecipients(
  supabase: SupabaseClient,
  permit: PermitRow
) {
  const { data } = await supabase
    .from("user_site_roles")
    .select(`
      role,
      user:user_id (id,email,full_name,role)
    `)
    .eq("company_id", permit.company_id)
    .eq("site_id", permit.site_id)
    .eq("active", true);

  return (data ?? []).map((r: any) => r.user).filter(Boolean);
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
      "foreman@franklin.com.sg",
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
    stage4_closed: "Completed",
  }[e];
}

function buildSubject(p: PermitRow, e: PermitEmailEvent) {
  return `[ePermit] ${p.serial_no} - ${eventLabel(e)}`;
}
function appUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3000"
  );
}

function permitUrl(id: string) {
  return `${appUrl()}/permits/${id}`;
}

/* ================= MAIN ================= */

export async function notifyPermitEvent(input: NotifyPermitInput) {
  const permit = await getPermit(input.supabase, input.permitId);
  if (!permit) return;

  const company = await getCompany(input.supabase, permit.company_id);

  // ✅ VALIDASI COMPANY
  if (!company || !["CFE", "FOI"].includes(company.code)) {
    console.log("INVALID COMPANY", company);
    return;
  }

  const companyCode = company.code as "CFE" | "FOI";

  // ✅ DB USERS
  const dbUsers = await getRecipients(input.supabase, permit);

  // ✅ DIRECT USERS
  const directUsers = await getUsersByIds(input.supabase, [
    permit.applicant_id,
    permit.assessor_id,
    permit.srm_id,
  ].filter(Boolean) as string[]);

  /* ===== FILTER ROLE ===== */

  const filteredUsers =
    companyCode === "CFE"
      ? dbUsers
      : dbUsers.filter((u) =>
          ["applicant", "assessor", "srm"].includes(
            normalizeRole(u.role)
          )
        );

  /* ===== STATIC EMAIL ===== */

  const staticGroup = STATIC_EMAILS[companyCode];

  const staticEmails =
    companyCode === "CFE"
      ? [
          ...staticGroup.applicant,
          ...staticGroup.assessor,
          ...staticGroup.srm,
          ...staticGroup.admin,
        ]
      : [
          ...staticGroup.applicant,
          ...staticGroup.assessor,
          ...staticGroup.srm,
        ];

  /* ===== GROUP EMAIL ===== */

  const groupEmails = getGroupEmails(company);

  /* ===== FINAL ===== */

  const emails = uniqueEmails(
    [...filteredUsers, ...directUsers],
    [...staticEmails, ...groupEmails]
  );

  // ✅ DEBUG LOG (WAJIB BIAR GAK STRESS)
  console.log("📧 EMAIL RESULT:", {
    permit: permit.serial_no,
    company: companyCode,
    total: emails.length,
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

    <br/>

    <a href="${permitUrl(permit.id)}" 
       style="display:inline-block;padding:10px 16px;background:#2563eb;color:white;text-decoration:none;border-radius:6px;">
       🔗 Open Permit
    </a>

    <br/><br/>
    <p>Or open manually:</p>
    <p>${permitUrl(permit.id)}</p>
  `,
  text: `
${eventLabel(input.event)}

Permit: ${permit.serial_no}
Status: ${permit.state}
Location: ${permit.location_of_work}
Description: ${permit.description}

Open:
${permitUrl(permit.id)}
  `,
  });
}
