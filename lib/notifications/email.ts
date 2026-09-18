import "server-only";
import nodemailer from "nodemailer";

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

let cachedTransporter: ReturnType<typeof nodemailer.createTransport> | null =
  null;

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;

  const host = process.env.SMTP_HOST || "smtp.office365.com";
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  if (!user || !pass) {
    return null;
  }

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure: false, // TLS via STARTTLS on port 587, not implicit TLS on 465
    requireTLS: true,
    auth: { user, pass },
  });

  return cachedTransporter;
}

export async function sendEmailNotification(input: SendEmailInput) {
  const enabled = process.env.ENABLE_EMAIL_NOTIFICATIONS !== "false";
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER;

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

  const transporter = getTransporter();

  if (!transporter || !from) {
    console.log("[EMAIL MOCK - SMTP_USER/SMTP_PASSWORD missing]", {
      from,
      to: recipients,
      subject: input.subject,
      text: input.text,
    });

    return { skipped: true, reason: "missing_smtp_credentials" };
  }

  try {
    const info = await transporter.sendMail({
      from,
      to: recipients,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });

    console.log("[EMAIL SENT]", {
      to: recipients,
      subject: input.subject,
      id: info.messageId,
    });

    return { data: info };
  } catch (error) {
    console.error("[EMAIL ERROR]", error);
    return { error };
  }
}

// Manual re-send helper: builds and re-sends the exact same notification
// again (e.g. from an "Resend email" button in the permit detail page or an
// admin retry action) without needing to re-run the whole permit workflow.
export async function resendEmailNotification(input: SendEmailInput) {
  return sendEmailNotification(input);
}