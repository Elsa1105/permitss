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
}

export function EndorsementForm({ permitId, day, maxDay, existingDays }: Props) {
  const router = useRouter();

  const validToday =
    day >= 2 &&
    day <= Math.min(maxDay, 14) &&
    !existingDays.includes(day);

  const [chosenDay, setChosenDay] = React.useState(day);
  const [action, setAction] = React.useState<"continue" | "reject" | "revoke">(
    "continue",
  );
  const [remarks, setRemarks] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const dayOptions = validToday
    ? [
        {
          value: String(day),
          label: `Day ${day}`,
        },
      ]
    : [
        {
          value: String(day),
          label: existingDays.includes(day)
            ? `Day ${day} already endorsed`
            : `Day ${day} not available today`,
        },
      ];

  const canSubmitToday = validToday;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!canSubmitToday) {
      toast.error("Today is not available for endorsement");
      return;
    }

    if (chosenDay !== day) {
      toast.error(`Only Day ${day} can be endorsed today`);
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

        {!validToday ? (
          <p className="mt-1 text-xs text-amber-700">
            Daily endorsement is only available on the correct permit day and
            cannot be submitted early, late, duplicated, or out of sequence.
          </p>
        ) : (
          <p className="mt-1 text-xs text-slate-500">
            Only today&apos;s permit day can be endorsed.
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
          disabled={!validToday}
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
          disabled={!validToday}
        />
      </div>

      <Textarea
        label={`Remarks${action === "continue" ? " (optional)" : " (required)"}`}
        required={action !== "continue"}
        value={remarks}
        onChange={(e) => setRemarks(e.target.value)}
        disabled={!validToday}
      />

      <div className="flex justify-end">
        <Button type="submit" loading={submitting} disabled={!canSubmitToday}>
          Submit
        </Button>
      </div>
    </form>
  );
}