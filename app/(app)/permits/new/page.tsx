import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { NewPermitForm } from "@/components/permit/new-permit-form";
import { getCompaniesAndSites } from "@/lib/permits/queries";

export default async function NewPermitPage() {
  const user = await requireUser();

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

  const { companies, sites } = await getCompaniesAndSites();

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          New Hot Work Permit
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Fill in the header details. After saving you can complete Stage I
          safety checklist, upload evidence, and submit for Safety Assessor
          endorsement.
        </p>
      </div>

      <NewPermitForm
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