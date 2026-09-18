/**
 * SRM Endorsement Alerts — daily, prompting endorsement by 0900 hrs.
 *
 * Targets permits in 'approved_active' or 'pending_daily_endorsement' whose
 * current permit-day (day 2 onward — day 1 is the initial SRM approval, not
 * a daily endorsement) has no permit_endorsements row yet. SRMs "may skip
 * endorsements for a day or two" per the client's minutes, so this reminder
 * is informational only and never blocks or auto-escalates a skipped day.
 *
 * Scoping: grouped and notified PER COMPANY (all active SRMs in that
 * company get the digest), not per site — matches the same
 * users.company_id + role model used in permit-emails.ts, so stage
 * notifications and this reminder always agree on "who is an SRM here."
 */
export async function sendSrmEndorsementReminders(supabase: SupabaseClient) {
  const { data: permits, error } = await supabase
    .from("permits")
    .select(
      "id, serial_no, state, job_type, vessel_project, location_of_work, date_commencement, date_completion, company_id, site_id, applicant_id",
    )
    .in("state", ["approved_active", "pending_daily_endorsement"]);

  if (error) {
    console.error("[REMINDER] Failed to load permits for SRM reminder", error);
    return { sent: 0, skipped: 0, errors: 1 };
  }

  const candidates = ((permits ?? []) as ReminderPermit[]).filter((permit) => {
    const day = currentPermitDay(permit);
    return day >= 2 && day <= maxEndorsementDay(permit);
  });

  if (!candidates.length) {
    return { sent: 0, skipped: 0, errors: 0 };
  }

  const { data: existingEndorsements, error: endorsementsError } = await supabase
    .from("permit_endorsements")
    .select("permit_id, day_number")
    .in(
      "permit_id",
      candidates.map((permit) => permit.id),
    );

  if (endorsementsError) {
    console.error(
      "[REMINDER] Failed to load existing endorsements",
      endorsementsError,
    );
    return { sent: 0, skipped: 0, errors: 1 };
  }

  const endorsedKeys = new Set(
    (existingEndorsements ?? []).map((row) => `${row.permit_id}:${row.day_number}`),
  );

  const pending = candidates.filter((permit) => {
    const day = currentPermitDay(permit);
    return !endorsedKeys.has(`${permit.id}:${day}`);
  });

  if (!pending.length) {
    return { sent: 0, skipped: 0, errors: 0 };
  }

  // Group pending permits by company_id ONLY (not site) — SRM group is
  // company-wide, same scoping as getCompanyRoleGroup in permit-emails.ts.
  const byCompany = new Map<string, ReminderPermit[]>();
  for (const permit of pending) {
    if (!permit.company_id) continue;
    byCompany.set(permit.company_id, [
      ...(byCompany.get(permit.company_id) ?? []),
      permit,
    ]);
  }

  let sent = 0;
  let errors = 0;

  for (const [companyId, companyPermits] of byCompany) {
    // Company-wide SRMs, sourced directly from users.company_id + role —
    // same model as permit-emails.ts's getCompanyRoleGroup, so this never
    // drifts out of sync with stage-notification recipients again.
    const { data: srmUsers, error: srmError } = await supabase
      .from("users")
      .select("id, email, full_name, role")
      .eq("company_id", companyId)
      .eq("active", true);

    if (srmError) {
      console.error("[REMINDER] Failed to load SRMs for company", companyId, srmError);
      errors += 1;
      continue;
    }

    const recipients = ((srmUsers ?? []) as RecipientUser[] & { role?: string | null }[])
      .filter((u: any) => (u.role || "").toLowerCase().includes("srm") && u.email);

    if (!recipients.length) {
      console.log("[REMINDER SKIPPED] No active SRM found for company", companyId);
      continue;
    }

    const emails = Array.from(
      new Set(recipients.map((user) => user.email!.trim().toLowerCase())),
    );

    const permitsWithDay = companyPermits.map((permit) => ({
      permit,
      dayLabel: `Day ${currentPermitDay(permit)}`,
    }));

    try {
      await sendEmailNotification({
        to: emails,
        subject: `[ePermit] Daily endorsement reminder — ${companyPermits.length} permit(s) awaiting your action by 0900`,
        html: buildDigestHtml({
          heading: "Daily Endorsement Reminder",
          intro:
            "The following permits are awaiting your daily endorsement today. Please endorse by 0900 hrs where possible.",
          permits: permitsWithDay,
        }),
        text: buildDigestText({
          heading: "Daily Endorsement Reminder",
          intro:
            "The following permits are awaiting your daily endorsement today. Please endorse by 0900 hrs where possible.",
          permits: permitsWithDay,
        }),
      });
      sent += 1;
    } catch (err) {
      console.error("[REMINDER] Failed to send SRM reminder for company", companyId, err);
      errors += 1;
    }
  }

  return { sent, skipped: 0, errors };
}