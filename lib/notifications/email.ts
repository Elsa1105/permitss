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
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  });

  return cachedTransporter;
}

export async function sendEmailNotification(input: SendEmailInput) {
  const enabled = process.env.ENABLE_EMAIL_NOTIFICATIONS !== "false";
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER;

  const recipients = normalizeRecipients(input.to);

  if (!enabled) {
    console.error("[EMAIL DISABLED] ENABLE_EMAIL_NOTIFICATIONS=false - no email was sent", {
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
    console.error("[EMAIL NOT SENT] SMTP_USER/SMTP_PASSWORD (or EMAIL_FROM) missing in this environment", {
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
    const e = error as { code?: string; responseCode?: number; response?: string; message?: string };
    console.error("[EMAIL ERROR]", {
      code: e?.code,
      responseCode: e?.responseCode,
      response: e?.response,
      message: e?.message,
      hint:
        e?.responseCode === 535 || /5\.7\.139|5\.7\.57|SmtpClientAuthentication/i.test(e?.response ?? e?.message ?? "")
          ? "Office365 rejected the login: enable SMTP AUTH for this mailbox (Exchange admin: Set-CASMailbox -SmtpClientAuthenticationDisabled $false), check the password/MFA/security defaults."
          : undefined,
    });
    // A failed login must be retried with fresh credentials, not a cached transporter.
    cachedTransporter = null;
    return { error };
  }
}

// Manual re-send helper: builds and re-sends the exact same notification
// again (e.g. from an "Resend email" button in the permit detail page or an
// admin retry action) without needing to re-run the whole permit workflow.
export async function resendEmailNotification(input: SendEmailInput) {
  return sendEmailNotification(input);
}

/**
 * Admin diagnostic: reports which SMTP settings are present (never their
 * values) and whether the SMTP server accepts the login.
 */
export async function checkEmailSetup() {
  const status = {
    ENABLE_EMAIL_NOTIFICATIONS: process.env.ENABLE_EMAIL_NOTIFICATIONS !== "false",
    SMTP_HOST: process.env.SMTP_HOST || "smtp.office365.com (default)",
    SMTP_PORT: process.env.SMTP_PORT || "587 (default)",
    SMTP_USER_set: Boolean(process.env.SMTP_USER),
    SMTP_PASSWORD_set: Boolean(process.env.SMTP_PASSWORD),
    EMAIL_FROM_set: Boolean(process.env.EMAIL_FROM || process.env.SMTP_USER),
    NEXT_PUBLIC_APP_URL_set: Boolean(process.env.NEXT_PUBLIC_APP_URL),
  };

  const transporter = getTransporter();
  if (!transporter) {
    return { status, login: "skipped: SMTP_USER or SMTP_PASSWORD missing" };
  }

  try {
    await transporter.verify();
    return { status, login: "ok" };
  } catch (error) {
    cachedTransporter = null;
    const e = error as { code?: string; responseCode?: number; response?: string; message?: string };
    return {
      status,
      login: "failed",
      error: { code: e?.code, responseCode: e?.responseCode, response: e?.response, message: e?.message },
    };
  }
}
