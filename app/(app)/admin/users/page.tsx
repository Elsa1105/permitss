import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import {
  createServerSupabase,
  createServiceRoleSupabase,
} from "@/lib/supabase/server";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CsvUpload } from "./csv-upload";
import { UsersTable } from "./users-table";
import { ManualUserForm } from "./manual-user-form";
import type {
  CompanyRow,
  SiteRow,
  UserRole,
  UserRow,
  UserSiteRoleRow,
} from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "applicant", label: "Applicant" },
  { value: "guest_applicant", label: "Guest Applicant" },
  { value: "contractor", label: "Contractor" },
  { value: "assessor", label: "Safety Assessor" },
  { value: "srm", label: "SRM" },
  { value: "admin", label: "Admin" },
];

const ROLE_VALUES = ROLE_OPTIONS.map((item) => item.value);

type SiteRoleWithJoins = UserSiteRoleRow & {
  user: Pick<UserRow, "id" | "email" | "full_name"> | null;
  company: Pick<CompanyRow, "id" | "code" | "name"> | null;
  site: Pick<SiteRow, "id" | "code" | "name"> | null;
};

export default async function AdminUsersPage() {
  const currentAdmin = await requireAdmin();

  const supabase = await createServerSupabase();

  const [usersResult, companiesResult, sitesResult, siteRolesResult] =
    await Promise.all([
      supabase.from("users").select("*").order("full_name", {
        ascending: true,
      }),

      supabase
        .from("companies")
        .select("*")
        .order("code", { ascending: true }),

      supabase
        .from("sites")
        .select("*")
        .order("code", { ascending: true }),

      supabase
        .from("user_site_roles")
        .select(
          `
            *,
            user:user_id (
              id,
              email,
              full_name
            ),
            company:company_id (
              id,
              code,
              name
            ),
            site:site_id (
              id,
              code,
              name
            )
          `,
        )
        .order("created_at", { ascending: false }),
    ]);

  if (usersResult.error) {
    throw new Error(usersResult.error.message);
  }

  if (companiesResult.error) {
    throw new Error(companiesResult.error.message);
  }

  if (sitesResult.error) {
    throw new Error(sitesResult.error.message);
  }

  if (siteRolesResult.error) {
    throw new Error(siteRolesResult.error.message);
  }

  const users = (usersResult.data ?? []) as UserRow[];
  const companies = (companiesResult.data ?? []) as CompanyRow[];
  const sites = (sitesResult.data ?? []) as SiteRow[];
  const siteRoles = (siteRolesResult.data ?? []) as unknown as SiteRoleWithJoins[];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-slate-500 mt-1">
          Manage qualified personnel, guest applicants, contractors, safety
          assessors, ship-repair managers, admins, and company/site scoped
          access.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add user manually</CardTitle>
          <p className="text-sm text-slate-500 mt-1">
            Create a user account directly without CSV import.
          </p>
        </CardHeader>

        <CardBody>
          <ManualUserForm />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bulk import qualified personnel (CSV)</CardTitle>
          <p className="text-sm text-slate-500 mt-1">
            CSV columns:&nbsp;
            <code className="text-xs">
              email, full_name, department, role, qualified_for, active
            </code>
            &nbsp;(role:&nbsp;
            <code className="text-xs">
              applicant | guest_applicant | contractor | assessor | srm | admin
            </code>
            ; qualified_for: pipe-separated, e.g.&nbsp;
            <code className="text-xs">hot_work_applicant|hot_work_srm</code>).
          </p>
        </CardHeader>

        <CardBody>
          <CsvUpload />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Company / Site Role Assignment</CardTitle>
          <p className="text-sm text-slate-500 mt-1">
            Assign site-scoped access so assessors and SRMs only act within the
            correct company/site context.
          </p>
        </CardHeader>

        <CardBody className="space-y-6">
          <form
            action={addSiteRole}
            className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-4"
          >
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <label className="field">
                <span className="field-label field-required">User</span>
                <select name="user_id" className="input" required>
                  <option value="">Select user</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.full_name} — {user.email}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span className="field-label field-required">Company</span>
                <select name="company_id" className="input" required>
                  <option value="">Select company</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.code} - {company.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span className="field-label field-required">Site</span>
                <select name="site_id" className="input" required>
                  <option value="">Select site</option>
                  {sites.map((site) => {
                    const company = companies.find(
                      (item) => item.id === site.company_id,
                    );

                    return (
                      <option key={site.id} value={site.id}>
                        {company?.code ?? "Company"} / {site.code} - {site.name}
                      </option>
                    );
                  })}
                </select>
              </label>

              <label className="field">
                <span className="field-label field-required">Role</span>
                <select name="role" className="input" required>
                  <option value="">Select role</option>
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex justify-end">
              <button type="submit" className="btn-primary touch-target">
                Add / Activate Site Role
              </button>
            </div>
          </form>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="table-base">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Email</th>
                  <th>Company</th>
                  <th>Site</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>

              <tbody>
                {siteRoles.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="text-center text-sm text-slate-500 py-6"
                    >
                      No company/site role assignments yet.
                    </td>
                  </tr>
                ) : (
                  siteRoles.map((siteRole) => (
                    <tr key={siteRole.id}>
                      <td className="font-medium">
                        {siteRole.user?.full_name ?? "—"}
                      </td>

                      <td className="text-slate-600">
                        {siteRole.user?.email ?? "—"}
                      </td>

                      <td className="text-slate-600">
                        {siteRole.company
                          ? `${siteRole.company.code} - ${siteRole.company.name}`
                          : "—"}
                      </td>

                      <td className="text-slate-600">
                        {siteRole.site
                          ? `${siteRole.site.code} - ${siteRole.site.name}`
                          : "—"}
                      </td>

                      <td className="capitalize text-slate-700">
                        {siteRole.role.replaceAll("_", " ")}
                      </td>

                      <td>
                        <span
                          className={
                            siteRole.active
                              ? "badge bg-emerald-50 text-emerald-700 border-emerald-300"
                              : "badge bg-slate-100 text-slate-600 border-slate-300"
                          }
                        >
                          {siteRole.active ? "Active" : "Inactive"}
                        </span>
                      </td>

                      <td className="text-right">
                        <form action={removeSiteRole}>
                          <input
                            type="hidden"
                            name="site_role_id"
                            value={siteRole.id}
                          />

                          <button
                            type="submit"
                            className="text-sm text-red-600 hover:underline"
                          >
                            Remove
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All users ({users.length})</CardTitle>
        </CardHeader>

        <CardBody className="p-0">
          <UsersTable users={users} currentUserId={currentAdmin.id} />
        </CardBody>
      </Card>
    </div>
  );
}

async function addSiteRole(formData: FormData) {
  "use server";

  await requireAdmin();

  const userId = String(formData.get("user_id") ?? "");
  const companyId = String(formData.get("company_id") ?? "");
  const siteId = String(formData.get("site_id") ?? "");
  const role = String(formData.get("role") ?? "") as UserRole;

  if (!userId || !companyId || !siteId || !role) {
    throw new Error("User, company, site, and role are required.");
  }

  if (!ROLE_VALUES.includes(role)) {
    throw new Error("Invalid role.");
  }

  const service = createServiceRoleSupabase();

  const { error } = await service.from("user_site_roles").upsert(
    {
      user_id: userId,
      company_id: companyId,
      site_id: siteId,
      role,
      active: true,
    },
    {
      onConflict: "user_id,company_id,site_id,role",
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/users");
}

async function removeSiteRole(formData: FormData) {
  "use server";

  await requireAdmin();

  const siteRoleId = String(formData.get("site_role_id") ?? "");

  if (!siteRoleId) {
    throw new Error("Site role ID is required.");
  }

  const service = createServiceRoleSupabase();

  const { error } = await service
    .from("user_site_roles")
    .delete()
    .eq("id", siteRoleId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/users");
}