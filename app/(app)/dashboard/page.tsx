import Link from "next/link";
import { ArrowRight, FilePlus } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { listPermits } from "@/lib/permits/queries";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { PermitTable } from "@/components/dashboard/permit-table";
import type { PermitState } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();

  // Build the right queue per role
  let myQueueStates: PermitState[] = [];
  let myQueueTitle = "Your queue";
  if (user.role === "applicant") {
    myQueueTitle = "Drafts & in-progress permits";
    myQueueStates = [
      "draft",
      "pending_safety_assessment",
      "pending_srm_approval",
      "approved_active",
      "pending_daily_endorsement",
      "pending_closure",
    ];
  } else if (user.role === "assessor") {
    myQueueTitle = "Pending Stage II — Safety Assessment";
    myQueueStates = ["pending_safety_assessment"];
  } else if (user.role === "srm") {
    myQueueTitle = "All in-progress permits (SRM has authority over every stage)";
    myQueueStates = [
      "draft",
      "pending_safety_assessment",
      "pending_srm_approval",
      "approved_active",
      "pending_daily_endorsement",
      "pending_closure",
    ];
  } else if (user.role === "admin") {
    myQueueTitle = "All in-progress permits";
    myQueueStates = [
      "draft",
      "pending_safety_assessment",
      "pending_srm_approval",
      "approved_active",
      "pending_daily_endorsement",
      "pending_closure",
    ];
  }

  const queue = await listPermits({
    state: myQueueStates,
    applicantId: user.role === "applicant" ? user.id : undefined,
    limit: 50,
  });

  const recent = await listPermits({ limit: 10 });

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
        {(user.role === "applicant" || user.role === "admin" || user.role === "srm") && (
          <Link href="/permits/new">
            <Button size="lg">
              <FilePlus className="h-5 w-5" /> New Hot Work Permit
            </Button>
          </Link>
        )}
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
            <PermitTable permits={queue} />
          )}
        </CardBody>
      </Card>

      {user.role !== "applicant" && (
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
      )}
    </div>
  );
}

function dashboardSubtitle(role: string) {
  switch (role) {
    case "applicant":
      return "Raise a Hot Work Permit, fill Stage I, and track your in-progress permits.";
    case "assessor":
      return "Review pending Stage II permits and endorse fit / not-fit after physical inspection.";
    case "srm":
      return "Approve Stage III, endorse Day 2–14 continuations, revoke when needed, and override Stage I/II/IV when needed.";
    case "admin":
      return "Manage users, qualified personnel, and review the full audit log.";
    default:
      return "";
  }
}
