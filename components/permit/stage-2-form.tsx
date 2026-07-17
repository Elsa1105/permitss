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

type ChecklistStatus = "unset" | "yes" | "no" | "na";
type ChecklistState = Record<ChecklistKey, ChecklistStatus>;

const CHECKLIST_ITEMS: {
  key: ChecklistKey;
  label: string;
  description?: string;
}[] = [
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
  isolation_checked: "unset",
  barricade_installed: "unset",
  gas_test_completed: "unset",
  fire_watch_assigned: "unset",
  ppe_verified: "unset",
  evidence_reviewed: "unset",
};

export function Stage2Form({ permitId }: { permitId: string }) {
  const router = useRouter();

  const [fit, setFit] = React.useState<boolean | null>(null);
  const [remarks, setRemarks] = React.useState("");
  const [correctiveAction, setCorrectiveAction] = React.useState("");
  const [rectificationDate, setRectificationDate] = React.useState("");
  const [checklist, setChecklist] =
    React.useState<ChecklistState>(INITIAL_CHECKLIST);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const hasUnset = CHECKLIST_ITEMS.some(
    (item) => checklist[item.key] === "unset",
  );

  const hasNo = CHECKLIST_ITEMS.some((item) => checklist[item.key] === "no");

  const hasNa = CHECKLIST_ITEMS.some((item) => checklist[item.key] === "na");

  const allSatisfiedForFit = !hasUnset && !hasNo;

  function setChecklistItem(key: ChecklistKey, status: ChecklistStatus) {
    setChecklist((current) => ({
      ...current,
      [key]: status,
    }));
  }

  function buildNaSummary() {
    const naLabels = CHECKLIST_ITEMS.filter(
      (item) => checklist[item.key] === "na",
    ).map((item) => item.label);

    if (!naLabels.length) return "";

    return `N/A items: ${naLabels.join(", ")}.`;
  }

  function checklistForCurrentBackend() {
    return CHECKLIST_ITEMS.reduce(
      (acc, item) => {
        const status = checklist[item.key];

        acc[item.key] = status === "yes" || status === "na";

        return acc;
      },
      {} as Record<ChecklistKey, boolean>,
    );
  }

  function checklistStatusPayload() {
    return CHECKLIST_ITEMS.reduce(
      (acc, item) => {
        acc[item.key] = checklist[item.key];
        return acc;
      },
      {} as Record<ChecklistKey, ChecklistStatus>,
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (fit === null) {
      setError("Please mark Fit or Not Fit.");
      return;
    }

    if (hasUnset) {
      setError("Please select Yes, No, or N/A for every checklist item.");
      return;
    }

    const cleanedRemarks = remarks.trim();

    if (fit === true && hasNo) {
      setError(
        "Permit cannot be marked Fit while any checklist item is marked No.",
      );
      return;
    }

    if (fit === true && hasNa && cleanedRemarks.length === 0) {
      setError("Remarks are required when any checklist item is marked N/A.");
      return;
    }

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

    const naSummary = buildNaSummary();

    const remarksWithNa =
      naSummary && !cleanedRemarks.includes(naSummary)
        ? `${cleanedRemarks}${cleanedRemarks ? "\n\n" : ""}${naSummary}`
        : cleanedRemarks;

    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch(`/api/permits/${permitId}/stage2`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fit,
          remarks: remarksWithNa,
          checklist: checklistForCurrentBackend(),
          corrective_action: fit === false ? correctiveAction.trim() : null,
          rectification_date: fit === false ? rectificationDate : null,

          // Future-ready payload for the later schema/RPC update.
          checklist_status: checklistStatusPayload(),
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
            Select Yes, No, or N/A. N/A is allowed for items that are not
            applicable, but remarks are required.
          </p>
        </div>

        <div className="space-y-3">
          {CHECKLIST_ITEMS.map((item) => {
            const status = checklist[item.key];

            return (
              <div
                key={item.key}
                className="rounded-md border border-slate-200 bg-white p-3"
              >
                <div className="mb-2 text-sm font-medium text-slate-900">
                  {item.label}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <StatusButton
                    label="Yes"
                    active={status === "yes"}
                    tone="ok"
                    onClick={() => setChecklistItem(item.key, "yes")}
                  />

                  <StatusButton
                    label="No"
                    active={status === "no"}
                    tone="bad"
                    onClick={() => setChecklistItem(item.key, "no")}
                  />

                  <StatusButton
                    label="N/A"
                    active={status === "na"}
                    tone="neutral"
                    onClick={() => setChecklistItem(item.key, "na")}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {hasUnset ? (
          <p className="text-xs text-amber-700">
            Every checklist item must be marked Yes, No, or N/A.
          </p>
        ) : hasNo ? (
          <p className="text-xs text-red-700">
            Items marked No must be resolved before the permit can be marked Fit.
          </p>
        ) : (
          <p className="text-xs text-emerald-700">
            Checklist is complete. Items marked N/A will be recorded in remarks.
          </p>
        )}
      </div>

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
          disabled={!allSatisfiedForFit}
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
        label={
          fit === false || hasNa ? "Remarks (required)" : "Remarks (optional)"
        }
        required={fit === false || hasNa}
        value={remarks}
        onChange={(e) => setRemarks(e.target.value)}
        placeholder={
          fit === false
            ? "What conditions need to be addressed before hot work can proceed?"
            : hasNa
              ? "Explain why the N/A item(s) are not applicable."
              : "Any additional notes…"
        }
      />

      {fit === false ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-3">
          <h4 className="text-sm font-semibold text-red-800">
            Not Fit for Work — additional details
          </h4>

          <p className="text-xs text-red-700">
            Attach photo evidence and a comment above in the Photos section,
            then complete the fields below.
          </p>

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

function StatusButton({
  label,
  active,
  tone,
  onClick,
}: {
  label: string;
  active: boolean;
  tone: "ok" | "bad" | "neutral";
  onClick: () => void;
}) {
  const activeClass =
    tone === "ok"
      ? "border-emerald-600 bg-emerald-50 text-emerald-700"
      : tone === "bad"
        ? "border-red-600 bg-red-50 text-red-700"
        : "border-blue-600 bg-blue-50 text-blue-700";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border px-3 py-2 text-sm font-medium transition-colors",
        active
          ? activeClass
          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
      )}
    >
      {label}
    </button>
  );
}