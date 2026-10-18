import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { requireUser } from "@/lib/auth/session";

export default async function PermitAccessDeniedPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  await requireUser();
  const { reason } = await searchParams;
  const isLifting = reason === "lifting";
  return (
    <div className="mx-auto max-w-xl rounded-xl border border-amber-200 bg-amber-50 p-6">
      <ShieldAlert className="mb-3 h-8 w-8 text-amber-700" />
      <h1 className="text-xl font-semibold text-slate-900">Permission required</h1>
      <p className="mt-2 text-sm text-slate-700">
        {isLifting
          ? "Creating a Lifting Permit requires the Lifting Applicant (Lifting Supervisor) qualification. Please contact your administrator to verify your qualifications and site access."
          : "Your account role does not allow you to create a permit. Contact your administrator if you believe this is incorrect."}
      </p>
      <div className="mt-5 flex flex-wrap gap-4 text-sm">
        <Link className="font-medium text-blue-700 hover:underline" href="/permits">View all permits</Link>
        <Link className="font-medium text-blue-700 hover:underline" href="/dashboard">Back to dashboard</Link>
      </div>
    </div>
  );
}
