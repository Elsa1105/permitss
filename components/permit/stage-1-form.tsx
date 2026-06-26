"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Stage1Schema } from "@/lib/permits/schemas";
import { formatDate } from "@/lib/utils";
import type { UserRow } from "@/lib/supabase/types";

interface Props {
  permitId: string;
  currentUser: Pick<UserRow, "full_name" | "department">;
}

export function Stage1Form({ permitId, currentUser }: Props) {
  const router = useRouter();
  const [c1, setC1] = React.useState(false);
  const [c2, setC2] = React.useState(false);
  const [c3, setC3] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const allChecked = c1 && c2 && c3;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = Stage1Schema.safeParse({
      check_ventilation: c1,
      check_display: c2,
      check_watchman: c3,
    });
    if (!parsed.success) {
      toast.error("All three checklist items must be confirmed");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/permits/${permitId}/stage1`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error || "Submission failed");
        return;
      }
      toast.success("Stage I submitted. Pending Safety Assessor.");
      router.push(`/permits/${permitId}`);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>Stage I — Raising of Permit</CardTitle>
          <p className="text-sm text-slate-500 mt-1">
            I have taken measure to render the area safe and fit for hot work
            application. Further I shall comply with the under-mentioned
            requirements prior to and during the duration of hot work.
          </p>
        </CardHeader>
        <CardBody className="space-y-3">
          <Checkbox
            label="Maintain adequate ventilation & lighting."
            checked={c1}
            onChange={(e) => setC1(e.target.checked)}
            error={!c1 && submitting ? "Required" : undefined}
          />
          <Checkbox
            label="Prominent display of hot work permit with sketch."
            checked={c2}
            onChange={(e) => setC2(e.target.checked)}
            error={!c2 && submitting ? "Required" : undefined}
          />
          <Checkbox
            label="Provide watchman with fire extinguisher or hose."
            checked={c3}
            onChange={(e) => setC3(e.target.checked)}
            error={!c3 && submitting ? "Required" : undefined}
          />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-200 mt-4 text-sm">
            <ReadOnly label="Name" value={currentUser.full_name} />
            <ReadOnly label="Department" value={currentUser.department || "—"} />
            <ReadOnly label="Date" value={formatDate(new Date())} />
            <ReadOnly
              label="Time"
              value={new Date().toLocaleTimeString("en-SG", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            />
          </div>
          <p className="text-xs text-slate-500">
            Signature is captured automatically on submission via your authenticated session.
          </p>
        </CardBody>
        <CardFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.push(`/permits/${permitId}`)}
          >
            Back
          </Button>
          <Button type="submit" loading={submitting} disabled={!allChecked}>
            Submit Stage I
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="font-medium text-slate-900">{value}</div>
    </div>
  );
}
