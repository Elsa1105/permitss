import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { NewPermitForm } from "@/components/permit/new-permit-form";
import { getCompaniesAndSites } from "@/lib/permits/queries";
import {
  PERMIT_TYPE_HOT_WORK,
  PERMIT_TYPE_LIFTING,
  hasLiftingQualification,
} from "@/lib/permits/lifting";

export default async function NewPermitPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const user = await requireUser();
  const { type } = await searchParams;

  // /permits/new            -> Hot Work (unchanged)
  // /permits/new?type=lifting -> Lifting Permit
  const permitType =
    type === "lifting" ? PERMIT_TYPE_LIFTING : PERMIT_TYPE_HOT_WORK;
  const isLifting = permitType === PERMIT_TYPE_LIFTING;

  const allowedRoles = [
    "applicant",
    "guest_applicant",
    "contractor",
    "admin",
    "srm",
  ];

  if (!allowedRoles.includes(user.role)) {
    redirect("/dashboard?unauthorized=1");
  }

  // Lifting permits are raised only by the approved Lifting Supervisors.
  if (isLifting && !hasLiftingQualification(user, "lifting_applicant")) {
    redirect("/dashboard?unauthorized=1");
  }

  const { companies, sites } = await getCompaniesAndSites(user.id, user.role);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          {isLifting ? "New Lifting Permit" : "New Hot Work Permit"}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Fill in the header details...
        </p>
      </div>

      <NewPermitForm
        permitType={permitType}
        currentUser={{
          id: user.id,
          full_name: user.full_name,
          department: user.department ?? "",
          role: user.role,
        }}
        companies={companies}
        sites={sites}
      />
    </div>
  );
}
