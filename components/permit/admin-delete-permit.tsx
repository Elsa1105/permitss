"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminDeletePermit({ id }: { id: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function archive() {
    if (confirmation !== "DELETE" || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/permits/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Archive failed");
      router.replace("/permits");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Archive failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-red-200 bg-red-50/40 p-3 space-y-3">
      {!open ? (
        <button type="button" className="font-semibold text-red-700" onClick={() => setOpen(true)}>
          Archive draft permit (Admin only)
        </button>
      ) : (
        <>
          <p className="text-sm text-red-900">Admin only. Type <strong>DELETE</strong> to archive this draft permit. The audit history will be retained.</p>
          <input
            aria-label="Type DELETE to confirm"
            className="w-full rounded border p-2"
            placeholder="Type DELETE"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <button
            type="button"
            disabled={busy || confirmation !== "DELETE"}
            className="rounded bg-red-700 px-3 py-2 text-white disabled:opacity-50"
            onClick={archive}
          >
            {busy ? "Archiving..." : "Archive permit"}
          </button>
          <button type="button" className="ml-3" disabled={busy} onClick={() => { setOpen(false); setConfirmation(""); setError(""); }}>
            Cancel
          </button>
        </>
      )}
    </div>
  );
}
