import { requireUser } from "@/lib/auth/session";
import { createServerSupabase } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { allFormNosLabel } from "@/lib/permits/forms";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const supabase = await createServerSupabase();

  let siteRoles: any[] = [];

  if (user.role === "admin") {
    const { data } = await supabase
      .from("user_site_roles")
      .select("company:company_id ( code )")
      .eq("active", true);

    siteRoles = data ?? [];
  } else {
    const { data } = await supabase
      .from("user_site_roles")
      .select("company:company_id ( code )")
      .eq("user_id", user.id)
      .eq("active", true);

    siteRoles = data ?? [];
  }

  const companyCodes = Array.from(
    new Set(
      siteRoles
        .map(
          (r) =>
            (r as { company?: { code?: string } })?.company?.code ?? null
        )
        .filter((code): code is string => Boolean(code))
    )
  );

  const formNo = allFormNosLabel(
    companyCodes.includes("CFE") ? "CFE" : "FOI",
  );

  return (
    <AppShell user={user} formNo={formNo}>
      {children}
    </AppShell>
  );
}