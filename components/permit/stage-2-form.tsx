"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type ChecklistKey =
  | "isolation_checked"
  | "barricade_installed"
  | "gas_test_completed"
  | "fire_watch_assigned"
  | "ppe_verified"
  | "evidence_reviewed";

type ChecklistState = Record<ChecklistKey, boolean>;

const CHECKLIST_ITEMS: { key: ChecklistKey; label: string }[] = [
  {
    key: "isolation_checked",
    label: "Isolation checked",
  },
  {
    key: "barricade_installed",
    label: "Barricade installed",
  },
  {
    key: "gas_test_completed",
    label: "Gas test completed",
  },
  {
    key: "fire_watch_assigned",
    label: "Fire watch assigned",
  },
  {
    key: "ppe_verified",
    label: "PPE verified",
  },
  {
    key: "evidence_reviewed",
    label: "Evidence reviewed",
  },
];

const INITIAL_CHECKLIST: ChecklistState = {
  isolation_checked: false,
  barricade_installed: false,
  gas_test_completed: false,
  fire_watch_assigned: false,
  ppe_verified: false,
  evidence_reviewed: false,
};

export function Stage2Form({ permitId }: { permitId: string }) {
  const router = useRouter();

  const [fit, setFit] = React.useState<boolean | null>(null);
  const [remarks, setRemarks] = React.useState("");
  const [checklist, setChecklist] =
    React.useState<ChecklistState>(INITIAL_CHECKLIST);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const allChecklistCompleted = CHECKLIST_ITEMS.every(
    (item) => checklist[item.key],
  );

  function toggleChecklistItem(key: ChecklistKey) {
    setChecklist((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (fit === null) {
      setError("Please mark fit or not fit.");
      return;
    }

    if (fit === true && !allChecklistCompleted) {
      setError(
        "Please complete all condition-verification checklist items before marking the permit fit for hot work.",
      );
      return;
    }

    const cleanedRemarks = remarks.trim();

    if (!fit && cleanedRemarks.length === 0) {
      setError("Remarks are required when marking not fit.");
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
          checklist,
        }),
      });

      const body = await res.json();

      if (!res.ok) {
        toast.error(body.error || "Submission failed");
        return;
      }

      toast.success(fit ? "Endorsed fit for hot work" : "Marked not fit");
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
        I have reviewed the permit submission, supporting evidence, work
        conditions, and required safety controls. Based on this condition
        verification, I confirm whether the stated hot work location is fit to
        proceed.
      </p>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">
            Condition Verification Checklist
          </h4>
          <p className="text-xs text-slate-600 mt-1">
            Safety Assessor must verify the following conditions before marking
            the permit fit for hot work.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {CHECKLIST_ITEMS.map((item) => (
            <label
              key={item.key}
              className={cn(
                "flex items-center gap-3 rounded-md border p-3 text-sm cursor-pointer transition-colors",
                checklist[item.key]
                  ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
              )}
            >
              <input
                type="checkbox"
                checked={checklist[item.key]}
                onChange={() => toggleChecklistItem(item.key)}
                className="h-4 w-4 rounded border-slate-300"
              />
              <span>{item.label}</span>
            </label>
          ))}
        </div>

        {!allChecklistCompleted ? (
          <p className="text-xs text-amber-700">
            All checklist items must be completed before selecting Fit for Hot
            Work.
          </p>
        ) : (
          <p className="text-xs text-emerald-700">
            All condition-verification checklist items have been completed.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
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
          Fit for Hot Work
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
          Not Fit for Hot Work
        </button>
      </div>

      <Textarea
        label={fit === false ? "Remarks (required)" : "Remarks (optional)"}
        required={fit === false}
        value={remarks}
        onChange={(e) => setRemarks(e.target.value)}
        placeholder={
          fit === false
            ? "What conditions need to be addressed before hot work can proceed?"
            : "Any additional notes…"
        }
      />

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex justify-end">
        <Button type="submit" loading={submitting}>
          Submit Endorsement
        </Button>
      </div>
    </form>
  );
}