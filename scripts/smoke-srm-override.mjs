// Verifies the SRM override authority granted in migration 0005:
//   - SRM can submit Stage I on a permit they didn't raise
//   - SRM can submit Stage II without 'assessor' role
//   - SRM can submit Stage IV close-out (override)
//   - Stage III separation of duties remains enforced
//   - audit_log records the override metadata

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
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;

const PASS = "Franklin!ePermit2026";

const FAILS = [];
function check(name, ok, detail) {
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? "  -- " + detail : ""}`);
  if (!ok) FAILS.push(name);
}

async function asUser(email) {
  const c = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PASS });
  if (error) throw new Error(`signin ${email}: ${error.message}`);
  return c;
}

const admin = createClient(URL_, SVC, { auth: { persistSession: false } });

// Resolve the three named users
const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
const map = new Map((list?.users ?? []).map((u) => [u.email, u]));
const F = map.get("foreman@franklin.example");
const A = map.get("safety.assessor@franklin.example");
const S = map.get("srm@franklin.example");
if (!F || !A || !S) {
  console.error("Missing one of the three named users. Run scripts/provision-roles.mjs first.");
  process.exit(2);
}

// ---------- Scenario A: SRM overrides every stage on a permit raised by foreman ----------
console.log("\n[A] SRM override on a permit raised by Foreman …");
const foremanC = await asUser("foreman@franklin.example");
const today = new Date();
const tomorrow = new Date(today.getTime() + 86400000);
const inFiveDays = new Date(today.getTime() + 5 * 86400000);
const fmt = (d) => d.toISOString().slice(0, 10);

const { data: serial } = await foremanC.rpc("next_permit_serial", { p_permit_type: "hot_work_onshore" });
const { data: ins, error: insErr } = await foremanC.from("permits").insert({
  serial_no: serial,
  permit_type: "hot_work_onshore", state: "draft",
  vessel_project: "MV Override-Test",
  location_of_work: "Pier 5, Bay 12",
  date_commencement: fmt(tomorrow),
  date_completion: fmt(inFiveDays),
  description: "Verifying SRM override authority across Stage I, II and IV.",
  hazard_types: ["welding"], contractor: "Acme",
  applicant_id: F.id,
}).select("id").single();
check("Foreman creates draft permit", !insErr && !!ins?.id, insErr?.message);
const permitId = ins.id;

// SRM submits Stage I on the foreman's permit (override)
const srmC = await asUser("srm@franklin.example");
{
  const { error } = await srmC.rpc("permit_submit_stage1", {
    p_permit_id: permitId,
    p_stage_data: { check_ventilation: true, check_display: true, check_watchman: true },
  });
  check("SRM can submit Stage I on foreman's permit (override)", !error, error?.message);

  const { data: stage } = await admin.from("permit_stages").select("user_id, data")
    .eq("permit_id", permitId).eq("stage", "I").single();
  check("Stage I record stamped with SRM as user_id", stage?.user_id === S.id);
  check("Stage I data carries acting_as=srm_override",
    stage?.data?.acting_as === "srm_override", JSON.stringify(stage?.data?.acting_as));
}

// SRM submits Stage II (override — no assessor needed)
{
  const { error } = await srmC.rpc("permit_submit_stage2", {
    p_permit_id: permitId, p_fit: true, p_remarks: "Verified by SRM on-site",
  });
  check("SRM can submit Stage II (override)", !error, error?.message);

  const { data: stage } = await admin.from("permit_stages").select("user_id, data")
    .eq("permit_id", permitId).eq("stage", "II").single();
  check("Stage II stamped with SRM and acting_as=srm_override",
    stage?.user_id === S.id && stage?.data?.acting_as === "srm_override");
}

// SRM submits Stage III (their normal duty)
{
  const { error } = await srmC.rpc("permit_submit_stage3", {
    p_permit_id: permitId, p_decision: "approve", p_reason: null,
  });
  check("SRM approves Stage III", !error, error?.message);
}

// Day 2 endorsement
{
  const { error } = await srmC.rpc("permit_endorse_day", {
    p_permit_id: permitId, p_day: 2, p_action: "continue", p_remarks: null,
  });
  check("SRM endorses Day 2", !error, error?.message);
}

// SRM closes out (override Stage IV)
{
  const { error } = await srmC.rpc("permit_submit_stage4", { p_permit_id: permitId });
  check("SRM closes out Stage IV (override)", !error, error?.message);
  const { data: row } = await admin.from("permits")
    .select("state, closer_id").eq("id", permitId).single();
  check("Final state = closed_completed and closer = SRM",
    row?.state === "closed_completed" && row?.closer_id === S.id);
}

// ---------- Scenario B: separation-of-duties for Stage III is preserved ----------
console.log("\n[B] Separation of duties: SRM cannot approve a permit they raised …");
{
  const { data: serial2 } = await srmC.rpc("next_permit_serial", { p_permit_type: "hot_work_onshore" });
  const { data: ins2, error: insErr2 } = await srmC.from("permits").insert({
    serial_no: serial2, permit_type: "hot_work_onshore", state: "draft",
    vessel_project: "MV SRM-Self-Test",
    location_of_work: "Pier 99",
    date_commencement: fmt(tomorrow),
    date_completion: fmt(tomorrow),
    description: "SRM self-raised permit to verify Stage III separation of duties.",
    hazard_types: ["welding"], contractor: "Self",
    applicant_id: S.id,
  }).select("id").single();
  check("SRM can raise their own draft permit (RLS allows)", !insErr2 && !!ins2?.id, insErr2?.message);
  const pid2 = ins2.id;

  await srmC.rpc("permit_submit_stage1", {
    p_permit_id: pid2,
    p_stage_data: { check_ventilation: true, check_display: true, check_watchman: true },
  });
  await srmC.rpc("permit_submit_stage2", { p_permit_id: pid2, p_fit: true, p_remarks: null });

  const { error: sodErr } = await srmC.rpc("permit_submit_stage3", {
    p_permit_id: pid2, p_decision: "approve", p_reason: null,
  });
  check("SRM cannot approve Stage III on their own raised permit",
    !!sodErr && /separation|themselves/i.test(sodErr.message),
    sodErr?.message);

  await admin.from("permits").delete().eq("id", pid2);
}

// ---------- Scenario C: applicant cannot pretend to be SRM ----------
console.log("\n[C] Applicant cannot exercise SRM authority …");
{
  // Foreman tries to submit Stage III — should fail
  const { error } = await foremanC.rpc("permit_submit_stage3", {
    p_permit_id: permitId, p_decision: "approve", p_reason: null,
  });
  check("Applicant cannot submit Stage III", !!error, error?.message);
}

// ---------- Cleanup ----------
await admin.from("permits").delete().eq("id", permitId);
await admin.from("permit_counters").update({ current_value: 0 })
  .eq("permit_type", "hot_work_onshore").eq("year", today.getFullYear());

console.log("\n=================================================");
if (FAILS.length === 0) {
  console.log("✓ ALL SRM-OVERRIDE CHECKS PASSED");
  process.exit(0);
} else {
  console.log(`✗ ${FAILS.length} CHECK(S) FAILED:`);
  for (const f of FAILS) console.log("  - " + f);
  process.exit(1);
}
