// app/api/test-email/route.ts
//
// TEMPORARY endpoint to test whether your SMTP email is working.
// Usage: open in browser https://permitss.vercel.app/api/test-email?to=youremail@gmail.com
// DELETE this route once you're done testing — don't leave a test endpoint
// open in production without protection, since anyone could trigger an email send.

import { NextRequest, NextResponse } from "next/server";
import { sendEmailNotification } from "@/lib/notifications/email";

export async function GET(req: NextRequest) {
  const to = req.nextUrl.searchParams.get("to");

  if (!to) {
    return NextResponse.json(
      { error: "Add ?to=youremail@gmail.com to the URL" },
      { status: 400 },
    );
  }

  const result = await sendEmailNotification({
    to,
    subject: "Test email from Franklin ePermit",
    html: "<p>This is a test email. If you received this, your SMTP is working correctly ✅</p>",
    text: "This is a test email. If you received this, your SMTP is working correctly.",
  });

  if ("error" in result && result.error) {
    return NextResponse.json(
      {
        success: false,
        message: "Failed to send email",
        error: String(result.error),
      },
      { status: 500 },
    );
  }

  if ("skipped" in result && result.skipped) {
    return NextResponse.json(
      {
        success: false,
        message: "Email was skipped, not an error but it wasn't sent",
        reason: result.reason,
      },
      { status: 200 },
    );
  }

  return NextResponse.json({
    success: true,
    message: `Email successfully sent to ${to}`,
  });
}