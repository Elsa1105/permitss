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
  const r = role?.toLowerCase() || ""; 
 
  if (r.includes("applicant") || r.includes("foreman")) return "applicant"; 
  if (r.includes("assessor")) return "assessor"; 
  if (r.includes("srm")) return "srm"; 
 
  return ""; 
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
 
/* ================= ROLE → EVENT ================= */ 
 
function resolveRolesByEvent(event: PermitEmailEvent): string[] { 
  switch (event) { 
    case "stage1_submitted": 
      return ["assessor"]; 
 
    case "stage2_fit": 
    case "stage2_not_fit": 
      return ["srm"]; 
 
    case "stage3_approved": 
    case "stage3_rejected": 
      return ["applicant"]; 
 
    case "daily_endorsement": 
      return ["assessor", "srm"]; 
 
    case "stage4_closed": 
      return ["applicant", "assessor", "srm"]; 
 
    default: 
      return []; 
  } 
} 
 
/* ================= GET USERS (FIXED TYPE) ================= */ 
 
type UserSiteRoleRow = { 
  role: string; 
  user: UserRow | null; 
}; 
 
async function getRecipientsByRole( 
  supabase: SupabaseClient, 
  permit: PermitRow 
) { 
  const { data, error } = await supabase 
    .from("user_site_roles") 
    .select(` 
      role, 
      user:user_id (id,email,full_name,role) 
    `) 
    .eq("company_id", permit.company_id) 
    .eq("site_id", permit.site_id) 
    .eq("active", true); 
 
  if (error) { 
    console.error("getRecipientsByRole ERROR:", error); 
    return { 
      applicant: [], 
      assessor: [], 
      srm: [], 
    }; 
  } 
 
const rows = data ?? []; 
 
  const map: Record<string, UserRow[]> = { 
    applicant: [], 
    assessor: [], 
    srm: [], 
  }; 
 
  for (const row of rows) {
  const role = normalizeRole(row.role);
  if (!role) continue;

  const rawUser = (row as any).user;

  const user: UserRow | null =
    Array.isArray(rawUser)
      ? rawUser[0] ?? null
      : rawUser ?? null;

  if (map[role] && user && user.email) {
    map[role].push(user);
  }
}
 
  return map; 
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
 
/* ================= MAIN ================= */ 
 
export async function notifyPermitEvent(input: NotifyPermitInput) { 
  const permit = await getPermit(input.supabase, input.permitId); 
  if (!permit) return; 
 
  const company = await getCompany(input.supabase, permit.company_id); 
 
  if (!company || !["CFE", "FOI"].includes(company.code)) { 
    console.log("INVALID COMPANY", company); 
    return; 
  } 
 
  const roleMap = await getRecipientsByRole(input.supabase, permit); 
  const targetRoles = resolveRolesByEvent(input.event); 
  const groupEmails = getGroupEmails(company); 
 
  const roleToGroup: Record<string, string> = { 
    applicant: "foreman", 
    assessor: "assessor", 
    srm: "srm", 
  }; 
 
  let emails: string[] = []; 
 
  for (const role of targetRoles) { 
    const groupKey = roleToGroup[role]; 
 
    // ✅ PRIORITY: GROUP EMAIL 
    const group = groupEmails.find((g) => 
      g.toLowerCase().includes(groupKey) 
    ); 
 
    if (group) { 
      emails.push(group); 
    } else { 
      // fallback ke individual user 
      const users = roleMap[role] || []; 
      emails.push( 
        ...users.map((u) => u.email!).filter(Boolean) 
      ); 
    } 
  } 
 
  // remove duplicate 
  emails = Array.from(new Set(emails)); 
 
  console.log("📧 FINAL EMAIL:", { 
    permit: permit.serial_no, 
    event: input.event, 
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
    `, 
 
    text: ` 
${eventLabel(input.event)} 
Permit: ${permit.serial_no} 
Status: ${permit.state} 
Location: ${permit.location_of_work} 
Description: ${permit.description} 
    `, 
  }); 
}