"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  REJECT_DEFINITION,
  REVOKE_DEFINITION,
} from "@/lib/permits/action-definitions";

type Decision = "approve" | "reject";

const STAGE_III_SIMOPS_WORDING =
  "I have reviewed the permit for SIMOPS coordination, work location, schedule, and potential conflicts with other activities. Based on the submitted permit details and Safety Assessor endorsement, I confirm that the hot work may proceed under coordination approval.";

export function Stage3Form({ permitId }: { permitId: string }) {
  const router = useRouter();
  const [decision, setDecision] = React.useState<Decision | null>(null);
  const [reason, setReason] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!decision) {
      setError("Please choose Approve or Reject.");
      return;
    }

    const cleanedReason = reason.trim();

    if (decision === "reject" && cleanedReason.length === 0) {
      setError("Reason is required to reject a permit.");
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch(`/api/permits/${permitId}/stage3`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          reason: cleanedReason,
        }),
      });

      const body = await res.json();

      if (!res.ok) {
        toast.error(body.error || "Submission failed");
        return;
      }

      toast.success(
        decision === "approve" ? "Permit approved" : "Permit rejected",
      );

      router.refresh();
    } catch {
      toast.error("Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="text-sm text-slate-700">
        {STAGE_III_SIMOPS_WORDING}
      </p>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setDecision("approve")}
          className={cn(
            "p-4 rounded-md border-2 text-center font-medium touch-target",
            decision === "approve"
              ? "border-emerald-600 bg-emerald-50 text-emerald-700"
              : "border-slate-300 bg-white hover:bg-slate-50",
          )}
        >
          Approve
        </button>

        <button
          type="button"
          onClick={() => setDecision("reject")}
          className={cn(
            "p-4 rounded-md border-2 text-center font-medium touch-target",
            decision === "reject"
              ? "border-red-600 bg-red-50 text-red-700"
              : "border-slate-300 bg-white hover:bg-slate-50",
          )}
        >
          Reject
        </button>
      </div>

      <Textarea
        label={
          decision === "reject"
            ? "Reason for rejection (required)"
            : "Notes (optional)"
        }
        required={decision === "reject"}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <p className="text-xs text-slate-400 border-t border-slate-200 pt-2">
        <span className="font-medium">Definitions</span> — {REJECT_DEFINITION} {REVOKE_DEFINITION}{" "}
        Once a permit has been approved and work has started, it can no longer be rejected here — use
        Revoke in the daily endorsement step instead.
      </p>

      <div className="flex justify-end">
        <Button type="submit" loading={submitting}>
          Submit Decision
        </Button>
      </div>
    </form>
  );
}