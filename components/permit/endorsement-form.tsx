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

  const canSubmit = hasAvailableDay && isValidSelection;

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
            Click a day above (today or a missed day — public holiday, leave,
            oversight) to select it, then submit below. Any earlier day that
            hasn&apos;t been endorsed yet will be auto-filled as
            &quot;Continue&quot; when you submit — e.g. submitting Day 5 with
            Days 2–4 still open will fill Days 2–4 as Continue and record
            your chosen action for Day 5. Any authorised SRM / Project
            Manager for this site may submit the endorsement for leave
            coverage.
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

      <Textarea
        label={`Remarks${action === "continue" ? " (optional)" : " (required)"}`}
        required={action !== "continue"}
        value={remarks}
        onChange={(e) => setRemarks(e.target.value)}
        disabled={!canSubmit}
      />

      <p className="text-xs text-slate-400 border-t border-slate-200 pt-2">
        <span className="font-medium">Definitions</span> — {CONTINUE_DEFINITION}{" "}
        {REJECT_DEFINITION} {REVOKE_DEFINITION} From Day 2 onward, use Revoke.
      </p>

      <div className="flex justify-end">
        <Button type="submit" loading={submitting} disabled={!canSubmit}>
          Submit
        </Button>
      </div>
    </form>
  );
}
