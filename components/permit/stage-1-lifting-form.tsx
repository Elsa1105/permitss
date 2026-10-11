"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn, formatDate } from "@/lib/utils";
import {
  LIFTING_CHECKLIST,
  type LiftingChecklistKey,
  type LiftingChecklistValue,
} from "@/lib/permits/lifting";
import { LiftingStage1Schema } from "@/lib/permits/schemas";
import type { UserRow } from "@/lib/supabase/types";

interface Props {
  permitId: string;
  currentUser: Pick<UserRow, "full_name" | "department">;
}

type State = Partial<Record<LiftingChecklistKey, LiftingChecklistValue>>;

export function Stage1LiftingForm({ permitId, currentUser }: Props) {
  const router = useRouter();
  const [state, setState] = React.useState<State>({});
  const [submitting, setSubmitting] = React.useState(false);

  const allAnswered = LIFTING_CHECKLIST.every((item) => state[item.key]);

  function setItem(key: LiftingChecklistKey, value: LiftingChecklistValue) {
    setState((current) => ({ ...current, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    const parsed = LiftingStage1Schema.safeParse({ checklist_status: state });

    if (!parsed.success) {
      toast.error(
        "Every condition must be confirmed, or marked NA if not applicable",
      );
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch(`/api/permits/${permitId}/stage1`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(body.error || "Submission failed");
        return;
      }

      toast.success("Stage I submitted. Pending Assessor.");
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
          <CardTitle>Stage I — Raising of Permit-to-Work</CardTitle>
          <p className="text-sm text-slate-500 mt-1">
            I have taken measures to render the area safe and fit for the
            lifting permit application. Further I shall also comply with the
            under-mentioned requirements prior to the commencement and during
            the duration of the work applied for. Confirm each condition of
            issue; if not applicable, mark NA.
          </p>
        </CardHeader>

        <CardBody className="space-y-2">
          {LIFTING_CHECKLIST.map((item) => {
            const value = state[item.key];

            return (
              <div
                key={item.key}
                className="flex flex-col gap-2 rounded-md border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="text-sm font-medium text-slate-900">
                  {item.label}
                </div>

                <div className="grid grid-cols-2 gap-2 sm:w-48">
                  <ChoiceButton
                    label="✓ Confirmed"
                    active={value === "yes"}
                    tone="ok"
                    onClick={() => setItem(item.key, "yes")}
                  />
                  <ChoiceButton
                    label="NA"
                    active={value === "na"}
                    tone="neutral"
                    onClick={() => setItem(item.key, "na")}
                  />
                </div>
              </div>
            );
          })}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-200 mt-4 text-sm">
            <ReadOnly label="Name" value={currentUser.full_name} />
            <ReadOnly
              label="Department"
              value={currentUser.department || "—"}
            />
            <ReadOnly label="Date" value={formatDate(new Date())} />
            <ReadOnly
              label="Time"
              value={new Date().toLocaleTimeString("en-SG", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "Asia/Singapore",
              })}
            />
          </div>

          <p className="text-xs text-slate-500">
            Signature is captured automatically on submission via your
            authenticated session.
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
          <Button type="submit" loading={submitting} disabled={!allAnswered}>
            Submit Stage I
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

function ChoiceButton({
  label,
  active,
  tone,
  onClick,
}: {
  label: string;
  active: boolean;
  tone: "ok" | "neutral";
  onClick: () => void;
}) {
  const activeClass =
    tone === "ok"
      ? "border-emerald-600 bg-emerald-50 text-emerald-700"
      : "border-blue-600 bg-blue-50 text-blue-700";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
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

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="font-medium text-slate-900">{value}</div>
    </div>
  );
}
