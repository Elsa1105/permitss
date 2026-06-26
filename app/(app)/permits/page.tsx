import Link from "next/link";
import { FilePlus } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { listPermits } from "@/lib/permits/queries";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { PermitTable } from "@/components/dashboard/permit-table";

export const dynamic = "force-dynamic";

export default async function PermitsPage() {
  const user = await requireUser();
  const permits = await listPermits({ limit: 200 });

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">All Permits</h1>
          <p className="text-sm text-slate-500 mt-1">
            {permits.length} permit{permits.length === 1 ? "" : "s"} visible to you.
          </p>
        </div>
        {(user.role === "applicant" || user.role === "admin" || user.role === "srm") && (
          <Link href="/permits/new">
            <Button>
              <FilePlus className="h-5 w-5" /> New
            </Button>
          </Link>
        )}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Permits</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          {permits.length === 0 ? (
            <EmptyState
              title="No permits yet"
              description="Once a permit is raised it will appear here."
              className="border-0"
            />
          ) : (
            <PermitTable permits={permits} />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
