import Link from "next/link";
import { Card, CardBody } from "@/components/ui/card";

export default function PermitNotFound() {
  return (
    <div className="max-w-xl mx-auto">
      <Card>
        <CardBody className="text-center py-10 space-y-3">
          <h1 className="text-xl font-semibold">Permit not found</h1>
          <p className="text-sm text-slate-500">
            It may have been deleted, or you don&rsquo;t have permission to view it.
          </p>
          <Link href="/permits" className="btn-primary inline-flex">
            Back to permits
          </Link>
        </CardBody>
      </Card>
    </div>
  );
}
