// Provision the three named users: Foreman/Supervisor, Safety Assessor, SRM.
// Idempotent: re-running just resets passwords and metadata.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2];
  }
}
loadEnv();

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const c = createClient(URL_, SVC, { auth: { persistSession: false } });

const PASSWORD = "Franklin!ePermit2026";

const PEOPLE = [
  {
    email: "foreman@franklin.example",
    full_name: "Foreman / Supervisor",
    department: "Production",
    role: "applicant",
    qualified_for: ["hot_work_applicant"],
  },
  {
    email: "safety.assessor@franklin.example",
    full_name: "Safety Assessor",
    department: "HSE",
    role: "assessor",
    qualified_for: ["hot_work_assessor"],
  },
  {
    email: "srm@franklin.example",
    full_name: "Ship-Repair Manager",
    department: "Operations",
    role: "srm",
    qualified_for: ["hot_work_applicant", "hot_work_assessor", "hot_work_srm"],
  },
];

const { data: existing } = await c.auth.admin.listUsers({ page: 1, perPage: 200 });
const byEmail = new Map((existing?.users ?? []).map((u) => [u.email, u]));

console.log("\nProvisioning users:\n");
for (const p of PEOPLE) {
  let userId;
  const found = byEmail.get(p.email);
  if (found) {
    await c.auth.admin.updateUserById(found.id, { password: PASSWORD, email_confirm: true });
    userId = found.id;
    console.log(`  • ${p.email}  (updated)`);
  } else {
    const { data, error } = await c.auth.admin.createUser({
      email: p.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: p.full_name },
    });
    if (error) throw new Error(`create ${p.email}: ${error.message}`);
    userId = data.user.id;
    console.log(`  • ${p.email}  (created)`);
  }
  const { error: upErr } = await c.from("users").upsert({
    id: userId,
    email: p.email,
    full_name: p.full_name,
    department: p.department,
    role: p.role,
    qualified_for: p.qualified_for,
    active: true,
  });
  if (upErr) throw new Error(`upsert ${p.email}: ${upErr.message}`);
}

console.log("\n=== Credentials ===");
console.log("Sign in at: https://franklin-epermit.vercel.app/login\n");
console.log("Password (same for all three): " + PASSWORD + "\n");
for (const p of PEOPLE) {
  console.log(`  ${p.role.padEnd(10)} ${p.email}`);
  console.log(`             ${p.full_name} (${p.department}) — qualified for: ${p.qualified_for.join(", ")}`);
}
console.log("");
