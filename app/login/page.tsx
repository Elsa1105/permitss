import { redirect } from "next/navigation";
import { LoginForm } from "./login-form";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; inactive?: string }>;
}) {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect("/dashboard");

  const { next, inactive } = await searchParams;
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-100 to-blue-50">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white text-xl font-bold mb-3">
            F
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Franklin Offshore ePermit
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Hot Work Permit (Onshore) — FOI-SG-057
          </p>
        </div>
        <div className="card p-6">
          {inactive ? (
            <div className="mb-4 rounded-md bg-amber-50 border border-amber-300 p-3 text-sm text-amber-800">
              Your account is inactive. Contact an administrator.
            </div>
          ) : null}
          <LoginForm next={next ?? "/dashboard"} />
        </div>
        <p className="text-center text-xs text-slate-400 mt-6">
          Sessions expire after 8 hours. Identity is enforced — sign in only as yourself.
        </p>
      </div>
    </div>
  );
}
