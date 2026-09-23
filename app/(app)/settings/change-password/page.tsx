import { requireUser } from "@/lib/auth/session";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ChangePasswordForm } from "./change-password-form";

export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
  const user = await requireUser();

  return (
    <div className="max-w-md mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Change Password
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {user.must_change_password
            ? "Your password was set by an admin. Please choose your own password to continue."
            : "Set a new password for your account."}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{user.email}</CardTitle>
        </CardHeader>
        <CardBody>
          <ChangePasswordForm forced={user.must_change_password} />
        </CardBody>
      </Card>
    </div>
  );
}
