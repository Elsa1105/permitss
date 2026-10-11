"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/input";
import {
  CONTINUE_DEFINITION,
  REJECT_DEFINITION,
  REVOKE_DEFINITION,
} from "@/lib/permits/action-definitions";

interface Props {
  permitId: string;
  maxDay: number;
  existingDays: number[];
  /**
   * All Day 2..today days that have not been endorsed yet (including today).
   * A day stays in this list after its own date has passed if it was missed
   * (public holiday, leave, oversight) — that's what allows retrospective
   * catch-up endorsement instead of the permit getting stuck.
   */
  pendingDays: number[];
  /** Currently selected day, controlled by the day grid above this form. */
  selectedDay: number;
  onSelectDay: (day: number) => void;
}

export function EndorsementForm({
  permitId,
  maxDay,
  existingDays,
  pendingDays,
  selectedDay,
  onSelectDay,
}: Props) {
  const router = useRouter();

  const hasAvailableDay = pendingDays.length > 0;
  const isValidSelection = pendingDays.includes(selectedDay);

  const [action, setAction] = React.useState<"continue" | "reject" | "revoke">(
    "continue",
  );
  const [remarks, setRemarks] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [acknowledgedCatchup, setAcknowledgedCatchup] = React.useState(false);
  const earlierOpenDays = pendingDays.filter((day) => day < selectedDay);
  const hasCatchup = earlierOpenDays.length > 0;

  const canSubmit = hasAvailableDay && isValidSelection && !hasCatchup;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!canSubmit) {
      toast.error("Click a pending day above before submitting");
      return;
    }

    if (existingDays.includes(selectedDay)) {
      toast.error("That day has already been endorsed");
      return;
    }

    if (selectedDay < 2 || selectedDay > 14) {
      toast.error("Daily endorsement must be between Day 2 and Day 14");
      return;
    }

    if (selectedDay > maxDay) {
      toast.error(`This permit only requires endorsement up to Day ${maxDay}`);
      return;
    }

    if (hasCatchup) {
      toast.error("Endorse the earlier missing days individually before this day");
      return;
    }

    if (hasCatchup && remarks.trim().length === 0) {
      toast.error("Record a reason for retrospective / catch-up endorsement");
      return;
    }

    if (action !== "continue" && remarks.trim().length === 0) {
      toast.error("Remarks required for reject/revoke");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch(`/api/permits/${permitId}/endorsements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          day: selectedDay,
          action,
          remarks: remarks.trim() || null,
        }),
      });

      const body = await res.json();

      if (!res.ok) {
        toast.error(body.error || "Endorsement failed");
        return;
      }

      const filledDays: number[] = Array.isArray(body?.filled_days)
        ? body.filled_days
        : [];

      toast.success(
        filledDays.length
          ? `Day ${selectedDay} ${action} — Day ${filledDays.join(", ")} auto-filled as Continue`
          : `Day ${selectedDay} ${action}`,
      );
      setRemarks("");
      setAcknowledgedCatchup(false);
      setAction("continue");

      // Move the picker to the next pending day, if any, so the SRM can
      // keep going without re-clicking the grid above.
      const next = pendingDays.find((d) => d !== selectedDay);
      if (next) {
        onSelectDay(next);
      }

      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-md border border-slate-200 bg-slate-50 p-4 space-y-3"
    >
      <div>
        <h3 className="font-semibold text-sm">SRM endorsement</h3>

        {!hasAvailableDay ? (
          <p className="mt-1 text-xs text-amber-700">
            No day is currently pending endorsement. Future days cannot be
            endorsed in advance.
          </p>
        ) : (
          <p className="mt-1 text-xs text-slate-500">
            Select an outstanding permit day. If you choose a later day, the
            you must complete each earlier missing day individually first.
            No day is automatically marked Continue. Weekends count as calendar
            days until HSE approves a different rule. Actual submission times
            remain recorded. Only an authorised SRM / Project Manager may endorse.
          </p>
        )}
      </div>

      {hasAvailableDay ? (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
          {isValidSelection ? (
            <>
              Endorsing <span className="font-semibold">Day {selectedDay}</span>
            </>
          ) : (
            "Click a pending day above to select it"
          )}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3">
        <Select
          label="Action"
          required
          value={action}
          onChange={(e) => setAction(e.target.value as typeof action)}
          options={[
            { value: "continue", label: "Continue" },
            { value: "revoke", label: "Revoke" },
            {
              value: "reject",
              label: "Reject (rarely used after Day 0 — see note below)",
              muted: true,
            },
          ]}
          disabled={!canSubmit}
        />
        {action === "reject" ? (
          <p className="text-xs text-amber-700">
            Heads up: Reject is meant for Day 0, before the permit is approved. Since this permit
            is already active, Revoke is normally the correct action to stop it. Only choose Reject
            here if you specifically mean to reverse the original approval decision itself.
          </p>
        ) : null}
      </div>

      {hasCatchup && isValidSelection ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 space-y-2 text-sm text-amber-950">
          <p className="font-semibold">Retrospective endorsement / audit warning</p>
          <p>
            Submitting Day {selectedDay} will automatically fill outstanding Day
            {earlierOpenDays.join(", Day ")} as Continue in the current database workflow.
            This does not verify that those days were inspected. Record the
            reason and obtain the applicable HSE approval before proceeding.
          </p>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={acknowledgedCatchup}
              onChange={(e) => setAcknowledgedCatchup(e.target.checked)}
            />
            <span>I understand the earlier days will be filled retrospectively and confirm I am authorised to proceed.</span>
          </label>
        </div>
      ) : null}

      <Textarea
        label={`Remarks${action === "continue" && !hasCatchup ? " (optional)" : " (required)"}`}
        required={action !== "continue" || hasCatchup}
        value={remarks}
        onChange={(e) => setRemarks(e.target.value)}
        disabled={!canSubmit}
      />

      <p className="text-xs text-slate-400 border-t border-slate-200 pt-2">
        <span className="font-medium">Definitions</span> — {CONTINUE_DEFINITION}{" "}
        {REJECT_DEFINITION} {REVOKE_DEFINITION} From Day 2 onward, use Revoke.
      </p>

      <div className="flex justify-end">
        <Button type="submit" loading={submitting} disabled={!canSubmit || (hasCatchup && !acknowledgedCatchup)}>
          Submit
        </Button>
      </div>
    </form>
  );
}
