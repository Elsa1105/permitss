import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect("/dashboard");
  redirect("/login");
}
