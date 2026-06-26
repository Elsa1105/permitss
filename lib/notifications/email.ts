import "server-only";
import { Resend } from "resend";

type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
};

function normalizeRecipients(to: string | string[]) {
  if (Array.isArray(to)) {
    return to.filter(Boolean);
  }

  return [to].filter(Boolean);
}

export async function sendEmailNotification(input: SendEmailInput) {
  const enabled = process.env.ENABLE_EMAIL_NOTIFICATIONS !== "false";
  const apiKey = process.env.RESEND_API_KEY;
  const from =
    process.env.EMAIL_FROM || "Franklin ePermit <onboarding@resend.dev>";

  const recipients = normalizeRecipients(input.to);

  if (!enabled) {
    console.log("[EMAIL DISABLED]", {
      to: recipients,
      subject: input.subject,
    });

    return { skipped: true, reason: "disabled" };
  }

  if (!recipients.length) {
    console.log("[EMAIL SKIPPED] No recipients", {
      subject: input.subject,
    });

    return { skipped: true, reason: "no_recipients" };
  }

  if (!apiKey) {
    console.log("[EMAIL MOCK - RESEND_API_KEY missing]", {
      from,
      to: recipients,
      subject: input.subject,
      text: input.text,
    });

    return { skipped: true, reason: "missing_api_key" };
  }

  const resend = new Resend(apiKey);

  const { data, error } = await resend.emails.send({
    from,
    to: recipients,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });

  if (error) {
    console.error("[EMAIL ERROR]", error);
    return { error };
  }

  console.log("[EMAIL SENT]", {
    to: recipients,
    subject: input.subject,
    id: data?.id,
  });

  return { data };
}