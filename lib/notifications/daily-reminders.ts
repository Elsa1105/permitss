import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmailNotification } from "./email";
import { currentPermitDay, maxEndorsementDay } from "@/lib/permits/day";
import type { PermitRow } from "@/lib/supabase/types";

/**
 * Two daily reminder jobs, per the 21 Jul 2026 client minutes:
 *
 *   "SRM Endorsement Alerts: Daily alerts shall be sent to SRMs, prompting
 *    endorsement by 0900 hrs."
 *
 *   "Permit Closure Notifications: Applicants should receive notifications
 *    prompting them to close completed permits."
 *
 * Both are meant to be invoked once a day by an external scheduler hitting
 * the /api/cron/* routes that wrap these functions (see vercel.json for the
 * 0900 Asia/Singapore schedule). Neither function throws on a per-permit or
 * per-recipient failure — one bad row should never stop the rest of the
 * batch from sending.
 */

type ReminderPermit = Pick<
  PermitRow,
  | "id"
  | "serial_no"
  | "state"
  | "job_type"
  | "vessel_project"
  | "location_of_work"
  | "date_commencement"
  | "date_completion"
  | "company_id"
  | "site_id"
  | "applicant_id"
>;

type RecipientUser = {
  id: string;
  email: string | null;
  full_name: string | null;
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

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function permitLine(permit: ReminderPermit, dayLabel?: string) {
  return `${permit.serial_no} — ${permit.job_type || "Hot Work"} — ${permit.location_of_work}${
    dayLabel ? ` (${dayLabel})` : ""
  }`;
}

function buildDigestHtml(opts: {
  heading: string;
  intro: string;
  permits: Array<{ permit: ReminderPermit; dayLabel?: string }>;
}) {
  const rows = opts.permits
    .map(
      ({ permit, dayLabel }) => `
        <tr>
          <td style="padding: 6px 12px; border-bottom: 1px solid #e2e8f0;">${escapeHtml(
            permit.serial_no,
          )}</td>
          <td style="padding: 6px 12px; border-bottom: 1px solid #e2e8f0;">${escapeHtml(
            permit.job_type || "—",
          )}</td>
          <td style="padding: 6px 12px; border-bottom: 1px solid #e2e8f0;">${escapeHtml(
            permit.location_of_work,
          )}</td>
          <td style="padding: 6px 12px; border-bottom: 1px solid #e2e8f0;">${
            dayLabel ? escapeHtml(dayLabel) : "—"
          }</td>
          <td style="padding: 6px 12px; border-bottom: 1px solid #e2e8f0;">
            <a href="${permitUrl(permit.id)}">Open</a>
          </td>
        </tr>`,
    )
    .join("");

  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #0f172a;">
      <h2 style="margin-bottom: 8px;">${escapeHtml(opts.heading)}</h2>
      <p>${escapeHtml(opts.intro)}</p>
      <table style="border-collapse: collapse; margin-top: 12px; width: 100%;">
        <thead>
          <tr>
            <th style="text-align:left; padding: 6px 12px; border-bottom: 2px solid #0f172a;">Permit No.</th>
            <th style="text-align:left; padding: 6px 12px; border-bottom: 2px solid #0f172a;">Job Type</th>
            <th style="text-align:left; padding: 6px 12px; border-bottom: 2px solid #0f172a;">Location</th>
            <th style="text-align:left; padding: 6px 12px; border-bottom: 2px solid #0f172a;">Day</th>
            <th style="text-align:left; padding: 6px 12px; border-bottom: 2px solid #0f172a;"></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin-top: 24px; font-size: 12px; color: #64748b;">
        This is an automated daily reminder from Franklin ePermit.
      </p>
    </div>
  `;
}

function buildDigestText(opts: {
  heading: string;
  intro: string;
  permits: Array<{ permit: ReminderPermit; dayLabel?: string }>;
}) {
  const lines = opts.permits
    .map(({ permit, dayLabel }) => `- ${permitLine(permit, dayLabel)}\n  ${permitUrl(permit.id)}`)
    .join("\n");

  return `${opts.heading}\n\n${opts.intro}\n\n${lines}\n`;
}

/**
 * SRM Endorsement Alerts — daily, prompting endorsement by 0900 hrs.
 *
 * Targets permits in 'approved_active' or 'pending_daily_endorsement' whose
 * current permit-day (day 2 onward — day 1 is the initial SRM approval, not
 * a daily endorsement) has no permit_endorsements row yet. SRMs "may skip
 * endorsements for a day or two" per the client's minutes, so this reminder
 * is informational only and never blocks or auto-escalates a skipped day.
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

  // Group pending permits by (company_id, site_id) so each SRM gets one
  // digest email listing every permit awaiting their endorsement today,
  // instead of one email per permit.
  const bySite = new Map<string, ReminderPermit[]>();
  for (const permit of pending) {
    if (!permit.company_id || !permit.site_id) continue;
    const key = `${permit.company_id}:${permit.site_id}`;
    bySite.set(key, [...(bySite.get(key) ?? []), permit]);
  }

  let sent = 0;
  let errors = 0;

  for (const [key, sitePermits] of bySite) {
    const [companyId, siteId] = key.split(":");

    const { data: srmRoles, error: srmError } = await supabase
      .from("user_site_roles")
      .select("user:user_id ( id, email, full_name )")
      .eq("company_id", companyId)
      .eq("site_id", siteId)
      .eq("role", "srm")
      .eq("active", true);

    if (srmError) {
      console.error("[REMINDER] Failed to load SRMs for site", key, srmError);
      errors += 1;
      continue;
    }

    const srmUsers = (srmRoles ?? [])
      .map((row: { user?: RecipientUser | RecipientUser[] | null }) =>
        Array.isArray(row.user) ? row.user[0] ?? null : row.user ?? null,
      )
      .filter((user): user is RecipientUser => Boolean(user?.email));

    if (!srmUsers.length) {
      console.log("[REMINDER SKIPPED] No SRM found for site", key);
      continue;
    }

    const emails = Array.from(
      new Set(srmUsers.map((user) => user.email!.trim().toLowerCase())),
    );

    const permitsWithDay = sitePermits.map((permit) => ({
      permit,
      dayLabel: `Day ${currentPermitDay(permit)}`,
    }));

    try {
      await sendEmailNotification({
        to: emails,
        subject: `[ePermit] Daily endorsement reminder — ${sitePermits.length} permit(s) awaiting your action by 0900`,
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
      console.error("[REMINDER] Failed to send SRM reminder for site", key, err);
      errors += 1;
    }
  }

  return { sent, skipped: 0, errors };
}

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
