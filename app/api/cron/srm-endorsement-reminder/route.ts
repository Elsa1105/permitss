import { NextResponse } from "next/server";
import { createServiceRoleSupabase } from "@/lib/supabase/server";
import { sendSrmEndorsementReminders } from "@/lib/notifications/daily-reminders";

// Invoked daily by the scheduler configured in vercel.json (0900 Asia/Singapore).
// Protected by CRON_SECRET so it can't be triggered by an outside request —
// Vercel Cron sends this same secret as a Bearer token automatically.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");

  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleSupabase();
  const result = await sendSrmEndorsementReminders(supabase);

  return NextResponse.json(result);
}
