import Link from "next/link";
import { FilePlus } from "lucide-react";
import { canCreatePermitType } from "@/lib/permits/type-permissions";
import { requireUser } from "@/lib/auth/session";
import { listPermits } from "@/lib/permits/queries";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { PermitsExplorer } from "@/components/dashboard/permits-explorer";

export const dynamic = "force-dynamic";

const PERMIT_CREATOR_ROLES = new Set([
  "applicant",
  "guest_applicant",
  "contractor",
  "admin",
  "srm",
]);

export default async function PermitsPage() {
  const user = await requireUser();
  const permits = await listPermits({ limit: 200 });

  const canCreateHotWork = canCreatePermitType(user, "hot_work_onshore");
  const canCreateLifting = canCreatePermitType(user, "lifting_operation");

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">All Permits</h1>
          <p className="text-sm text-slate-500 mt-1">
            Search, filter, open, and manage Hot Work and Lifting Permits accessible to you.
            {" "}{permits.length} permit{permits.length === 1 ? "" : "s"} listed.
          </p>
        </div>

        {canCreateHotWork || canCreateLifting ? (
          <div className="flex flex-wrap gap-2">
            {canCreateHotWork ? <Link href="/permits/new">
              <Button><FilePlus className="h-4 w-4" /> New Hot Work Permit</Button>
            </Link> : null}
            {canCreateLifting ? (
              <Link href="/permits/new/lifting">
                <Button variant="secondary"><FilePlus className="h-4 w-4" /> New Lifting Permit</Button>
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Permit Register — Hot Work &amp; Lifting</CardTitle>
        </CardHeader>

        <CardBody className="p-0">
          {permits.length === 0 ? (
            <EmptyState
              title="No permits yet"
              description="Once a permit is raised it will appear here."
              className="border-0"
            />
          ) : (
            <PermitsExplorer permits={permits} />
          )}
        </CardBody>
      </Card>
    </div>
  );
}