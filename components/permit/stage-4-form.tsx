"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function Stage4Form({ permitId }: { permitId: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!confirm("Confirm Stage IV close-out? This action is final.")) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/permits/${permitId}/stage4`, {
        method: "POST",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || "Close-out failed");
        return;
      }
      toast.success("Permit closed");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <p className="text-sm text-slate-700">
        Confirming notification of completion will close the permit and move it
        to the archive. Identity, department, date, and time are recorded
        automatically from your session.
      </p>
      <div className="flex justify-end">
        <Button type="submit" loading={submitting}>
          Submit Close-Out
        </Button>
      </div>
    </form>
  );
}
