import { requireUser } from "@/lib/auth/session";
import { createServerSupabase } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  // Figure out which company site(s) this user has active access to, so we
  // can show the right form number (FOI-SG-057 vs CFE-SG-057) in the
  // sidebar. Any active CFE site access shows the CFE form number; admins
  // (or anyone with no site access at all) fall back to the FOI form
  // number.
  const supabase = await createServerSupabase();
  const { data: siteRoles } = await supabase
    .from("user_site_roles")
    .select("company:company_id ( code )")
    .eq("user_id", user.id)
    .eq("active", true);

  const companyCodes = Array.from(
    new Set(
      (siteRoles ?? [])
        .map((r) => (r as unknown as { company: { code: string } | null }).company?.code)
        .filter((code): code is string => Boolean(code)),
    ),
  );

  const formNo = companyCodes.includes("CFE") ? "CFE-SG-057" : "FOI-SG-057";

  return (
    <AppShell user={user} formNo={formNo}>
      {children}
    </AppShell>
  );
}
