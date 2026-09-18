/**
 * Permit Closure Notifications — daily reminder to applicants prompting
 * them to close out permits once the job is complete. Targets permits past
 * their date_completion that are still open (not yet closed/revoked/expired),
 * since only the Applicant can close a permit per the client's spec.
 */
export async function sendApplicantClosureReminders(supabase: SupabaseClient) {
  const today = new Date().toISOString().slice(0, 10);

  const { data: permits, error } = await supabase
    .from("permits")
    .select(
      "id, serial_no, state, job_type, vessel_project, location_of_work, date_commencement, date_completion, company_id, site_id, applicant_id",
    )
    .in("state", ["approved_active", "pending_daily_endorsement", "pending_closure"])
    .lte("date_completion", today);

  if (error) {
    console.error(
      "[REMINDER] Failed to load permits for closure reminder",
      error,
    );
    return { sent: 0, skipped: 0, errors: 1 };
  }

  const candidates = (permits ?? []) as ReminderPermit[];

  if (!candidates.length) {
    return { sent: 0, skipped: 0, errors: 0 };
  }

  const byApplicant = new Map<string, ReminderPermit[]>();
  for (const permit of candidates) {
    if (!permit.applicant_id) continue;
    byApplicant.set(permit.applicant_id, [
      ...(byApplicant.get(permit.applicant_id) ?? []),
      permit,
    ]);
  }

  let sent = 0;
  let errors = 0;

  for (const [applicantId, applicantPermits] of byApplicant) {
    const { data: applicant, error: applicantError } = await supabase
      .from("users")
      .select("id, email, full_name")
      .eq("id", applicantId)
      .eq("active", true)
      .single();

    if (applicantError || !applicant?.email) {
      console.log(
        "[REMINDER SKIPPED] No active applicant email for",
        applicantId,
      );
      continue;
    }

    try {
      await sendEmailNotification({
        to: applicant.email,
        subject: `[ePermit] Reminder: ${applicantPermits.length} permit(s) ready to close`,
        html: buildDigestHtml({
          heading: "Permit Closure Reminder",
          intro:
            "The following permits have passed their completion date. If the job is finished, please close the permit(s) below.",
          permits: applicantPermits.map((permit) => ({ permit })),
        }),
        text: buildDigestText({
          heading: "Permit Closure Reminder",
          intro:
            "The following permits have passed their completion date. If the job is finished, please close the permit(s) below.",
          permits: applicantPermits.map((permit) => ({ permit })),
        }),
      });
      sent += 1;
    } catch (err) {
      console.error(
        "[REMINDER] Failed to send closure reminder to",
        applicantId,
        err,
      );
      errors += 1;
    }
  }

  return { sent, skipped: 0, errors };
}