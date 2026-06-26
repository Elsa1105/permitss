// End-to-end smoke test against the live Supabase project.
// Creates 4 test users (applicant, assessor, srm, admin), then walks a hot
// work permit through Stage I -> II -> III -> Day 2 endorsement -> Stage IV.
//
//   node scripts/smoke.mjs            # run
//   node scripts/smoke.mjs --cleanup  # also delete test users at the end
//
// Reads NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY /
// SUPABASE_SERVICE_ROLE_KEY from .env.local.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// ---------- env ----------
function loadEnv() {
  try {
    const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) process.env[m[1]] = m[2];
    }
  } catch {}
}
loadEnv();
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !ANON || !SVC) {
  console.error("Missing env vars in .env.local");
  process.exit(1);
}

const admin = createClient(URL_, SVC, { auth: { persistSession: false } });

const TS = Date.now();
const tag = (name) => `smoke+${TS}-${name}@franklin.example`;
const PASS = "Smoke!Test123";

const USERS = [
  { key: "applicant", role: "applicant", quals: ["hot_work_applicant"], full_name: "Smoke Applicant", department: "Production" },
  { key: "assessor",  role: "assessor",  quals: ["hot_work_assessor"],  full_name: "Smoke Assessor",  department: "HSE" },
  { key: "srm",       role: "srm",       quals: ["hot_work_srm"],       full_name: "Smoke SRM",       department: "Operations" },
  { key: "admin2",    role: "admin",     quals: ["hot_work_applicant","hot_work_assessor","hot_work_srm"], full_name: "Smoke Admin", department: "IT" },
];

const FAILS = [];
const NOTES = [];
function check(name, ok, detail) {
  const icon = ok ? "✓" : "✗";
  console.log(`  ${icon} ${name}${detail ? "  -- " + detail : ""}`);
  if (!ok) FAILS.push(name);
}
function note(s) { NOTES.push(s); console.log(`  · ${s}`); }

// helper: client signed-in as a user
async function asUser(email) {
  const c = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PASS });
  if (error) throw new Error(`signin ${email}: ${error.message}`);
  return c;
}

// ---------- 1. provision users ----------
console.log("\n[1] Provisioning users …");
const created = {};
for (const u of USERS) {
  const email = tag(u.key);
  // Create auth user with password (skips email verification using admin API)
  const { data, error } = await admin.auth.admin.createUser({
    email, password: PASS, email_confirm: true,
    user_metadata: { full_name: u.full_name },
  });
  if (error) {
    console.error(`createUser ${u.key} failed:`, error.message);
    process.exit(2);
  }
  // Update public.users (the trigger created a row from raw_user_meta_data,
  // but role/qualified_for/department need correcting).
  const { error: updErr } = await admin.from("users").upsert({
    id: data.user.id,
    email,
    full_name: u.full_name,
    department: u.department,
    role: u.role,
    qualified_for: u.quals,
    active: true,
  });
  if (updErr) {
    console.error(`upsert public.users ${u.key} failed:`, updErr.message);
    process.exit(2);
  }
  created[u.key] = { id: data.user.id, email };
  console.log(`  ${u.key} -> ${email}`);
}

// ---------- 2. Applicant creates permit (RPC: next_permit_serial + insert) ----------
console.log("\n[2] Applicant creates a Hot Work Permit (multi-day)…");
const applicantC = await asUser(created.applicant.email);
const today = new Date();
const tomorrow = new Date(today.getTime() + 86400000);
const inFiveDays = new Date(today.getTime() + 5 * 86400000);
const fmt = (d) => d.toISOString().slice(0, 10);

const { data: serial, error: serErr } = await applicantC.rpc("next_permit_serial", {
  p_permit_type: "hot_work_onshore",
});
check("next_permit_serial returns FOI-HWP-... format", !serErr && /^FOI-HWP-\d{4}-\d{3}$/.test(serial), serial);

const { data: permitInsert, error: insErr } = await applicantC
  .from("permits")
  .insert({
    serial_no: serial,
    permit_type: "hot_work_onshore",
    state: "draft",
    vessel_project: "MV Smoke Test",
    location_of_work: "Pier 3, Workshop B",
    date_commencement: fmt(tomorrow),
    date_completion: fmt(inFiveDays),
    description: "End-to-end smoke test of hot work permit lifecycle including multi-day endorsement.",
    hazard_types: ["welding", "cutting"],
    contractor: "Acme Ship Repair",
    applicant_id: created.applicant.id,
  })
  .select("id")
  .single();
check("applicant can INSERT draft permit", !insErr && !!permitInsert?.id, insErr?.message);
const permitId = permitInsert.id;

// Negative test: SRM trying to insert a permit as themselves should fail (only applicants/admin)
{
  const srmC = await asUser(created.srm.email);
  const { error: srmInsErr } = await srmC.from("permits").insert({
    serial_no: "FOI-HWP-2026-999",
    state: "draft",
    vessel_project: "Bad",
    location_of_work: "Bad",
    date_commencement: fmt(tomorrow),
    date_completion: fmt(tomorrow),
    description: "should be denied by RLS",
    hazard_types: ["welding"],
    contractor: "x",
    applicant_id: created.srm.id,
  });
  check("RLS denies SRM-as-applicant insert", !!srmInsErr, srmInsErr?.message);
}

// ---------- 3. Stage I: applicant submits checklist ----------
console.log("\n[3] Stage I — applicant submits checklist…");
{
  // First test: missing one checkbox should be rejected
  const { error: badErr } = await applicantC.rpc("permit_submit_stage1", {
    p_permit_id: permitId,
    p_stage_data: { check_ventilation: true, check_display: false, check_watchman: true },
  });
  check("Stage I rejects when not all 3 checks confirmed", !!badErr, badErr?.message);

  const { error: okErr } = await applicantC.rpc("permit_submit_stage1", {
    p_permit_id: permitId,
    p_stage_data: { check_ventilation: true, check_display: true, check_watchman: true },
  });
  check("Stage I accepted with all 3 checks", !okErr, okErr?.message);

  const { data: row } = await admin.from("permits").select("state, applicant_id").eq("id", permitId).single();
  check("After Stage I, state = pending_safety_assessment", row?.state === "pending_safety_assessment", row?.state);
}

// ---------- 4. Stage II: assessor unqualified vs qualified ----------
console.log("\n[4] Stage II — Safety Assessor endorsement…");
{
  // Unqualified assessor (use applicant trying assessor role) — should fail
  const { error: unauthErr } = await applicantC.rpc("permit_submit_stage2", {
    p_permit_id: permitId, p_fit: true, p_remarks: "trying as applicant",
  });
  check("Applicant cannot act as Safety Assessor", !!unauthErr, unauthErr?.message);

  const assessorC = await asUser(created.assessor.email);
  // First try: not fit without remarks should fail
  const { error: noRemErr } = await assessorC.rpc("permit_submit_stage2", {
    p_permit_id: permitId, p_fit: false, p_remarks: null,
  });
  check("Stage II rejects not-fit without remarks", !!noRemErr, noRemErr?.message);

  // Mark fit with remarks
  const { error: fitErr } = await assessorC.rpc("permit_submit_stage2", {
    p_permit_id: permitId, p_fit: true, p_remarks: "Site inspected, conditions acceptable.",
  });
  check("Assessor marks fit", !fitErr, fitErr?.message);

  const { data: row } = await admin.from("permits").select("state, assessor_id").eq("id", permitId).single();
  check("After Stage II, state = pending_srm_approval", row?.state === "pending_srm_approval", row?.state);
  check("assessor_id populated", row?.assessor_id === created.assessor.id);
}

// ---------- 5. Stage III: SRM approval ----------
console.log("\n[5] Stage III — SRM approval (with separation of duties)…");
{
  // Sanity: assessor cannot approve Stage III
  const assessorC = await asUser(created.assessor.email);
  const { error: notSrmErr } = await assessorC.rpc("permit_submit_stage3", {
    p_permit_id: permitId, p_decision: "approve", p_reason: null,
  });
  check("Assessor cannot act as SRM", !!notSrmErr, notSrmErr?.message);

  // Create a permit raised by SRM themselves to test separation of duties.
  // (In practice an SRM wouldn't be assigned applicant role too, but our admin user might.
  //  We skip this combination; the function check fires when applicant_id == auth.uid().)

  const srmC = await asUser(created.srm.email);
  const { error: rejNoReasonErr } = await srmC.rpc("permit_submit_stage3", {
    p_permit_id: permitId, p_decision: "reject", p_reason: null,
  });
  check("Stage III rejects 'reject' without reason", !!rejNoReasonErr, rejNoReasonErr?.message);

  const { error: appErr } = await srmC.rpc("permit_submit_stage3", {
    p_permit_id: permitId, p_decision: "approve", p_reason: null,
  });
  check("SRM approves", !appErr, appErr?.message);

  const { data: row } = await admin.from("permits").select("state, srm_id").eq("id", permitId).single();
  check("After Stage III, state = approved_active", row?.state === "approved_active", row?.state);
  check("srm_id populated", row?.srm_id === created.srm.id);
}

// ---------- 6. Day 2 endorsement (continue) and Day 4 revoke ----------
console.log("\n[6] Day 2 + Day 4 endorsements…");
{
  const srmC = await asUser(created.srm.email);
  const { error: e2 } = await srmC.rpc("permit_endorse_day", {
    p_permit_id: permitId, p_day: 2, p_action: "continue", p_remarks: null,
  });
  check("Day 2 continue endorsement", !e2, e2?.message);

  // Day 2 again should fail (unique day per permit)
  const { error: dup } = await srmC.rpc("permit_endorse_day", {
    p_permit_id: permitId, p_day: 2, p_action: "continue", p_remarks: null,
  });
  check("Duplicate day endorsement rejected", !!dup, dup?.message);

  // Day 4 revoke without remarks should fail
  const { error: rNoRem } = await srmC.rpc("permit_endorse_day", {
    p_permit_id: permitId, p_day: 4, p_action: "revoke", p_remarks: null,
  });
  check("Day 4 revoke requires remarks", !!rNoRem, rNoRem?.message);

  // We will NOT actually revoke (we want to close-out instead).
  // Use a separate permit later if you want to test revoke -> closed.
}

// ---------- 7. Stage IV close-out ----------
console.log("\n[7] Stage IV — close-out…");
{
  const applicantC2 = await asUser(created.applicant.email);
  const { error: closeErr } = await applicantC2.rpc("permit_submit_stage4", { p_permit_id: permitId });
  check("Applicant closes out permit", !closeErr, closeErr?.message);
  const { data: row } = await admin.from("permits").select("state, closer_id").eq("id", permitId).single();
  check("Final state = closed_completed", row?.state === "closed_completed", row?.state);
  check("closer_id populated", row?.closer_id === created.applicant.id);
}

// ---------- 8. Audit log verification ----------
console.log("\n[8] Audit log…");
{
  const { data: log } = await admin.from("audit_log").select("*").eq("permit_id", permitId).order("ts");
  check("audit_log has ≥ 5 entries (submit, fit, approved, endorsed, closed)", (log?.length ?? 0) >= 5, `${log?.length} rows`);
  const actions = (log ?? []).map((r) => r.action);
  for (const a of ["submitted", "fit", "approved", "endorsed_continue", "closed"]) {
    check(`audit_log contains '${a}'`, actions.includes(a));
  }

  // Verify direct insert into audit_log is denied for users
  const applicantC3 = await asUser(created.applicant.email);
  const { error: auditInsErr } = await applicantC3.from("audit_log").insert({
    action: "tampered", actor_id: created.applicant.id,
  });
  check("Direct INSERT into audit_log is denied", !!auditInsErr, auditInsErr?.message);
}

// ---------- 9. Storage bucket smoke ----------
console.log("\n[9] Storage bucket…");
{
  const { data: buckets } = await admin.storage.listBuckets();
  check("permit-photos bucket exists", buckets?.some((b) => b.id === "permit-photos"));
}

// ---------- cleanup ----------
if (process.argv.includes("--cleanup")) {
  console.log("\n[cleanup] Deleting test users…");
  for (const k of Object.keys(created)) {
    await admin.auth.admin.deleteUser(created[k].id).catch(() => {});
  }
  // The permit cascades via FK to created_by but we also nuke explicitly:
  await admin.from("permits").delete().eq("id", permitId).catch(() => {});
}

// ---------- summary ----------
console.log("\n=================================================");
if (FAILS.length === 0) {
  console.log("✓ ALL CHECKS PASSED");
  process.exit(0);
} else {
  console.log(`✗ ${FAILS.length} CHECK(S) FAILED:`);
  for (const f of FAILS) console.log("  - " + f);
  process.exit(1);
}
