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

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">
          Day
        </label>

        {/* Clickable day chips instead of a dropdown — SRM taps the day
            they want to endorse directly. Days already endorsed are shown
            greyed out and disabled; the current day and any missed days
            available for retrospective catch-up are clickable. */}
        <div className="flex flex-wrap gap-2">
          {Array.from(
            { length: Math.min(maxDay, 14) - 1 },
            (_, i) => i + 2,
          ).map((d) => {
            const isEndorsed = existingDays.includes(d);
            const isAvailable = availableDays.includes(d);
            const isSelected = chosenDay === d && isAvailable;
            const isToday = d === day;
            const isMissed = isAvailable && !isToday;

            return (
              <button
                key={d}
                type="button"
                disabled={!isAvailable}
                onClick={() => isAvailable && setChosenDay(d)}
                title={
                  isEndorsed
                    ? `Day ${d} already endorsed`
                    : isAvailable
                      ? isToday
                        ? `Day ${d} (today)`
                        : `Day ${d} — missed, click to catch up`
                      : `Day ${d} not available yet`
                }
                className={`min-w-[64px] rounded-lg border px-3 py-2 text-sm font-medium transition ${
                  isSelected
                    ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                    : isEndorsed
                      ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                      : isMissed
                        ? "border-amber-300 bg-amber-50 text-amber-800 hover:border-amber-400 hover:bg-amber-100"
                        : isAvailable
                          ? "border-slate-300 bg-white text-slate-700 hover:border-blue-400 hover:bg-blue-50"
                          : "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-300"
                }`}
              >
                Day {d}
                {isEndorsed ? (
                  <span className="ml-1">✓</span>
                ) : isMissed ? (
                  <span className="ml-1">⏳</span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-600" /> Selected
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-100 border border-amber-300" />{" "}
            Missed — click to catch up
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-100 border border-slate-200" />{" "}
            Already endorsed
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
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