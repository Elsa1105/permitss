// app/api/test-email/route.ts
//
// Endpoint SEMENTARA buat ngetes apakah SMTP email kamu jalan.
// Cara pakai: buka di browser https://permitss.vercel.app/api/test-email?to=emailkamu@gmail.com
// HAPUS route ini setelah selesai testing — jangan biarkan endpoint test
// terbuka di production tanpa proteksi, karena siapa saja bisa memicu kirim email.

import { NextRequest, NextResponse } from "next/server";
import { sendEmailNotification } from "@/lib/notifications/email";

export async function GET(req: NextRequest) {
  const to = req.nextUrl.searchParams.get("to");

  if (!to) {
    return NextResponse.json(
      { error: "Tambahkan ?to=emailkamu@gmail.com di URL" },
      { status: 400 },
    );
  }

  const result = await sendEmailNotification({
    to,
    subject: "Test email dari Franklin ePermit",
    html: "<p>Ini email test. Kalau kamu terima ini, SMTP kamu jalan dengan benar ✅</p>",
    text: "Ini email test. Kalau kamu terima ini, SMTP kamu jalan dengan benar.",
  });

  if ("error" in result && result.error) {
    return NextResponse.json(
      {
        success: false,
        message: "Gagal kirim email",
        error: String(result.error),
      },
      { status: 500 },
    );
  }

  if ("skipped" in result && result.skipped) {
    return NextResponse.json(
      {
        success: false,
        message: "Email di-skip, bukan error tapi nggak terkirim",
        reason: result.reason,
      },
      { status: 200 },
    );
  }

  return NextResponse.json({
    success: true,
    message: `Email berhasil dikirim ke ${to}`,
  });
}
