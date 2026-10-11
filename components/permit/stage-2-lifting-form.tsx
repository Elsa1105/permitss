"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Lifting Permit Stage II: the assessor / WSH coordinator / WSH officer only
 * records Fit or Not Fit after the physical check (no condition checklist).
 */
export function Stage2LiftingForm({ permitId }: { permitId: string }) {
  const router = useRouter();

  const [fit, setFit] = React.useState<boolean | null>(null);
  const [remarks, setRemarks] = React.useState("");
  const [correctiveAction, setCorrectiveAction] = React.useState("");
  const [rectificationDate, setRectificationDate] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (fit === null) {
      setError("Please mark Fit or Not Fit.");
      return;
    }

    const cleanedRemarks = remarks.trim();

    if (fit === false && cleanedRemarks.length === 0) {
      setError("Remarks are required when marking Not Fit.");
      return;
    }

    if (fit === false && correctiveAction.trim().length === 0) {
      setError("Corrective action required is mandatory when marking Not Fit.");
      return;
    }

    if (fit === false && rectificationDate.trim().length === 0) {
      setError("Expected rectification date is mandatory when marking Not Fit.");
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch(`/api/permits/${permitId}/stage2`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fit,
          remarks: cleanedRemarks,
          corrective_action: fit === false ? correctiveAction.trim() : null,
          rectification_date: fit === false ? rectificationDate : null,
        }),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(body.error || "Submission failed");
        return;
      }

      toast.success(fit ? "Endorsed fit for lifting" : "Marked not fit");
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
        I have conducted a physical check and the application is supported. I
        hereby certify that I have examined the above stated location and that
        the said location is fit or not fit for the lifting work.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setFit(true)}
          className={cn(
            "p-4 rounded-md border-2 text-center font-medium touch-target",
            fit === true
              ? "border-emerald-600 bg-emerald-50 text-emerald-700"
              : "border-slate-300 bg-white hover:bg-slate-50",
          )}
        >
          Fit for Lifting
        </button>

        <button
          type="button"
          onClick={() => setFit(false)}
          className={cn(
            "p-4 rounded-md border-2 text-center font-medium touch-target",
            fit === false
              ? "border-red-600 bg-red-50 text-red-700"
              : "border-slate-300 bg-white hover:bg-slate-50",
          )}
        >
          Not Fit for Lifting
        </button>
      </div>

      <Textarea
        label={fit === false ? "Remarks (required)" : "Remarks (optional)"}
        required={fit === false}
        value={remarks}
        onChange={(e) => setRemarks(e.target.value)}
        placeholder={
          fit === false
            ? "What conditions need to be addressed before lifting can proceed?"
            : "Any additional notes…"
        }
      />

      {fit === false ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-3">
          <h4 className="text-sm font-semibold text-red-800">
            Not Fit for Work — additional details
          </h4>

          <Textarea
            label="Corrective Action Required"
            required
            value={correctiveAction}
            onChange={(e) => setCorrectiveAction(e.target.value)}
            placeholder="What must be corrected before the location/work can be reassessed?"
          />

          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1">
              Expected Rectification Date
            </label>
            <input
              type="date"
              required
              value={rectificationDate}
              onChange={(e) => setRectificationDate(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex justify-end">
        <Button type="submit" loading={submitting}>
          Submit Endorsement
        </Button>
      </div>
    </form>
  );
}
