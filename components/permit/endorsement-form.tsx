"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/input";

interface Props {
  permitId: string;
  day: number;
  maxDay: number;
  existingDays: number[];
  /**
   * All Day 2..today days that have not been endorsed yet (including today).
   * A day stays in this list after its own date has passed if it was missed
   * (public holiday, leave, oversight) — that's what allows retrospective
   * catch-up endorsement instead of the permit getting stuck.
   */
  pendingDays?: number[];
}

export function EndorsementForm({
  permitId,
  day,
  maxDay,
  existingDays,
  pendingDays,
}: Props) {
  const router = useRouter();

  const availableDays =
    pendingDays && pendingDays.length > 0
      ? pendingDays
      : day >= 2 && day <= Math.min(maxDay, 14) && !existingDays.includes(day)
        ? [day]
        : [];

  const hasAvailableDay = availableDays.length > 0;

  const [chosenDay, setChosenDay] = React.useState<number>(
    availableDays[0] ?? day,
  );
  const [action, setAction] = React.useState<"continue" | "reject" | "revoke">(
    "continue",
  );
  const [remarks, setRemarks] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const dayOptions = hasAvailableDay
    ? availableDays.map((d) => ({
        value: String(d),
        label: d === day ? `Day ${d} (today)` : `Day ${d} — missed, catch up`,
      }))
    : [
        {
          value: String(day),
          label: existingDays.includes(day)
            ? `Day ${day} already endorsed`
            : `Day ${day} not available yet`,
        },
      ];

  const canSubmitToday = hasAvailableDay;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!canSubmitToday) {
      toast.error("No pending day is available for endorsement");
      return;
    }

    if (!availableDays.includes(chosenDay)) {
      toast.error("Please choose one of the available pending days");
      return;
    }

    if (existingDays.includes(chosenDay)) {
      toast.error("That day has already been endorsed");
      return;
    }

    if (chosenDay < 2 || chosenDay > 14) {
      toast.error("Daily endorsement must be between Day 2 and Day 14");
      return;
    }

    if (chosenDay > maxDay) {
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
          day: chosenDay,
          action,
          remarks: remarks.trim() || null,
        }),
      });

      const body = await res.json();

      if (!res.ok) {
        toast.error(body.error || "Endorsement failed");
        return;
      }

      toast.success(`Day ${chosenDay} ${action}`);
      setRemarks("");
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
            Choose today&apos;s day, or a missed day (public holiday, leave,
            oversight) to endorse it retrospectively. Any authorised SRM /
            Project Manager for this site may submit the endorsement for leave
            coverage.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Select
          label="Day"
          required
          value={String(chosenDay)}
          onChange={(e) => setChosenDay(Number(e.target.value))}
          options={dayOptions}
          disabled={!hasAvailableDay}
        />

        <Select
          label="Action"
          required
          value={action}
          onChange={(e) => setAction(e.target.value as typeof action)}
          options={[
            { value: "continue", label: "Continue" },
            { value: "reject", label: "Reject" },
            { value: "revoke", label: "Revoke" },
          ]}
          disabled={!hasAvailableDay}
        />
      </div>

      <Textarea
        label={`Remarks${action === "continue" ? " (optional)" : " (required)"}`}
        required={action !== "continue"}
        value={remarks}
        onChange={(e) => setRemarks(e.target.value)}
        disabled={!hasAvailableDay}
      />

      <div className="flex justify-end">
        <Button type="submit" loading={submitting} disabled={!canSubmitToday}>
          Submit
        </Button>
      </div>
    </form>
  );
}