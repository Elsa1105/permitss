import Link from "next/link";
import { ArrowRight, FilePlus } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { createServerSupabase } from "@/lib/supabase/server";
import { listPermits } from "@/lib/permits/queries";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { PermitTable } from "@/components/dashboard/permit-table";
import type { PermitState } from "@/lib/supabase/types";


export const dynamic = "force-dynamic";

const PERMIT_CREATOR_ROLES = new Set([
  "applicant",
  "guest_applicant",
  "contractor",
  "admin",
  "srm",
]);

const APPLICANT_QUEUE_ROLES = new Set([
  "applicant",
  "guest_applicant",
  "contractor",
]);

const IN_PROGRESS_STATES: PermitState[] = [
  "draft",
  "pending_safety_assessment",
  "pending_srm_approval",
  "approved_active",
  "pending_daily_endorsement",
  "pending_closure",
];

export default async function DashboardPage() {
  const user = await requireUser();

  let myQueueStates: PermitState[] = [];
  let myQueueTitle = "Your queue";

  if (APPLICANT_QUEUE_ROLES.has(user.role)) {
    myQueueTitle = "Drafts & in-progress permit requests";
    myQueueStates = IN_PROGRESS_STATES;
  } else if (user.role === "assessor") {
    myQueueTitle = "Pending Stage II — Safety Assessment";
    myQueueStates = ["pending_safety_assessment"];
  } else if (user.role === "srm") {
    myQueueTitle = "Permits requiring SRM action";
    myQueueStates = IN_PROGRESS_STATES;
  } else if (user.role === "admin") {
    myQueueTitle = "All in-progress permits";
    myQueueStates = IN_PROGRESS_STATES;
  }

  // CFE users see every permit raised for CFE (not just their own). Figure
  // out whether this user's active site access is CFE, and if so scope the
  // queue by company instead of by applicant.
  let cfeCompanyId: string | undefined;

  if (APPLICANT_QUEUE_ROLES.has(user.role)) {
    const supabase = await createServerSupabase();
    const { data: siteRoles } = await supabase
      .from("user_site_roles")
      .select("company_id, company:company_id ( code )")
      .eq("user_id", user.id)
      .eq("active", true);

    const cfeRole = (siteRoles ?? []).find(
      (r) =>
        (r as unknown as { company: { code: string } | null }).company
          ?.code === "CFE",
    );

    if (cfeRole) {
      cfeCompanyId = (cfeRole as unknown as { company_id: string })
        .company_id;
      myQueueTitle = "CFE — Drafts & in-progress permit requests";
    }
  }

  const queue = await listPermits({
    state: myQueueStates,
    companyId: cfeCompanyId,
    applicantId:
      !cfeCompanyId && APPLICANT_QUEUE_ROLES.has(user.role)
        ? user.id
        : undefined,
    limit: 50,
  });

  const recent = await listPermits({ limit: 10 });

  const canCreatePermit = PERMIT_CREATOR_ROLES.has(user.role);
  const showRecentActivity = !APPLICANT_QUEUE_ROLES.has(user.role);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome, {user.full_name.split(" ")[0]}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {dashboardSubtitle(user.role)}
          </p>
        </div>

        {canCreatePermit ? (
          <Link href="/permits/new">
            <Button size="lg">
              <FilePlus className="h-5 w-5" /> New Hot Work Permit
            </Button>
          </Link>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>{myQueueTitle}</CardTitle>

            <Link
              href="/permits"
              className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1"
            >
              View all <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </CardHeader>

        <CardBody className="p-0">
          {queue.length === 0 ? (
            <EmptyState
              title="Nothing pending"
              description="You're all caught up. New permits will appear here when they need your attention."
              className="border-0"
            />
          ) : (
            <PermitTable permits={queue} searchable={user.role === "srm"} />
          )}
        </CardBody>
      </Card>

      {showRecentActivity ? (
        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>

          <CardBody className="p-0">
            {recent.length === 0 ? (
              <EmptyState title="No permits yet" className="border-0" />
            ) : (
              <PermitTable permits={recent} />
            )}
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}

function dashboardSubtitle(role: string) {
  switch (role) {
    case "applicant":
      return "Raise a Hot Work Permit, fill Stage I, upload evidence, and track your in-progress permits.";

    case "guest_applicant":
      return "Raise contractor Hot Work Permit requests, upload RA/supporting documents, and track your submissions.";

    case "contractor":
      return "Submit contractor Hot Work Permit requests, upload RA/supporting documents, and track permit progress.";

    case "assessor":
      return "Review pending Stage II permits and endorse fit / not-fit after condition verification.";

    case "srm":
      return "Review SRM / Project Manager approvals, Day 2–14 endorsements, close-out readiness, and coordination decisions for your permitted site scope.";

    case "admin":
      return "Manage users, qualified personnel, company/site access, and review the audit log.";

    default:
      return "";
  }
}