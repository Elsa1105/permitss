import { requireAdmin } from "@/lib/auth/session";
import { createServerSupabase } from "@/lib/supabase/server";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { CsvUpload } from "./csv-upload";
import { UsersTable } from "./users-table";
import { ManualUserForm } from "./manual-user-form";
import type { UserRow } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const admin = await requireAdmin();

  const supabase = await createServerSupabase();

  const { data: users, error } = await supabase
    .from("users")
    .select("*")
    .order("full_name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-slate-500 mt-1">
          Manage qualified personnel: applicants, guest applicants /
          contractors, safety assessors, ship-repair managers, and admins.
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
            &nbsp;(role:{" "}
            <code className="text-xs">
              applicant | guest_applicant | contractor | assessor | srm | admin
            </code>
            ; qualified_for: pipe-separated, e.g.{" "}
            <code className="text-xs">hot_work_applicant|hot_work_srm</code>).
          </p>
        </CardHeader>
        <CardBody>
          <CsvUpload />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All users ({users?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <UsersTable
            users={(users ?? []) as UserRow[]}
            currentUserId={admin.id}
          />
        </CardBody>
      </Card>
    </div>
  );
}