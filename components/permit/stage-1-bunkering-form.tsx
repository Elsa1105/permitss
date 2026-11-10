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
  BUNKERING_PRECAUTIONS,
  BUNKERING_STAGE_I_DECLARATION,
  BUNKERING_TYPE_OF_WORK,
  type BunkeringChecklistKey,
  type BunkeringChecklistValue,
} from "@/lib/permits/bunkering";
import { BunkeringStage1Schema } from "@/lib/permits/schemas";
import type { UserRow } from "@/lib/supabase/types";

interface Props {
  permitId: string;
  currentUser: Pick<UserRow, "full_name" | "department">;
}

type State = Partial<Record<BunkeringChecklistKey, BunkeringChecklistValue>>;

export function Stage1BunkeringForm({ permitId, currentUser }: Props) {
  const router = useRouter();
  const [state, setState] = React.useState<State>({});
  const [othersText, setOthersText] = React.useState("");
  const [precautionOther, setPrecautionOther] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  // Tick / untick (all items are optional).
  function toggle(key: BunkeringChecklistKey) {
    setState((current) => {
      const next = { ...current };
      if (current[key] === "yes") delete next[key];
      else next[key] = "yes";
      return next;
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    const parsed = BunkeringStage1Schema.safeParse({
      checklist_status: state,
      others_text: othersText,
      precaution_other: precautionOther,
    });

    if (!parsed.success) {
      toast.error("Invalid selection");
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

      toast.success("Stage I submitted. Pending Safety Assessor.");
      router.push(`/permits/${permitId}`);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  const renderItems = (items: readonly { key: BunkeringChecklistKey; label: string }[]) =>
    items.map((item) => (
      <label
        key={item.key}
        className={cn(
          "flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm transition-colors",
          state[item.key] === "yes"
            ? "border-emerald-600 bg-emerald-50 text-emerald-800"
            : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50",
        )}
      >
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4"
          checked={state[item.key] === "yes"}
          onChange={() => toggle(item.key)}
        />
        <span>{item.label}</span>
      </label>
    ));

  return (
    <form onSubmit={onSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>
            Stage I — Raising of Hazardous Work Permit by Foreman or Supervisor
          </CardTitle>
          <p className="text-sm text-slate-500 mt-1">
            {BUNKERING_STAGE_I_DECLARATION} Tick what applies; it is not
            mandatory to tick every item.
          </p>
        </CardHeader>

        <CardBody className="space-y-4">
          <div>
            <div className="mb-2 text-sm font-semibold text-slate-900">
              Type of Work
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {renderItems(BUNKERING_TYPE_OF_WORK)}
            </div>
            <input
              type="text"
              maxLength={200}
              value={othersText}
              onChange={(e) => setOthersText(e.target.value)}
              placeholder="Others (please specify)"
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <div className="mb-2 text-sm font-semibold text-slate-900">
              Precautions
            </div>
            <div className="space-y-2">{renderItems(BUNKERING_PRECAUTIONS)}</div>
            <input
              type="text"
              maxLength={200}
              value={precautionOther}
              onChange={(e) => setPrecautionOther(e.target.value)}
              placeholder="Other precaution (optional)"
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-200 text-sm">
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
          <Button type="submit" loading={submitting}>
            Submit Stage I
          </Button>
        </CardFooter>
      </Card>
    </form>
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
