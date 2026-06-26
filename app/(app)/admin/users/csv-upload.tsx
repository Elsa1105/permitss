"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function CsvUpload() {
  const router = useRouter();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [report, setReport] = React.useState<{
    invited: number;
    updated: number;
    skipped: number;
    errors: { row: number; email?: string; error: string }[];
  } | null>(null);

  async function onFile(file: File) {
    setBusy(true);
    setReport(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/users/csv", { method: "POST", body: fd });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error || "Upload failed");
        return;
      }
      setReport(body);
      toast.success(
        `${body.invited} invited, ${body.updated} updated, ${body.skipped} skipped`,
      );
      router.refresh();
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
        <Button
          type="button"
          onClick={() => fileRef.current?.click()}
          loading={busy}
          variant="secondary"
        >
          <Upload className="h-4 w-4" /> Choose CSV
        </Button>
        <a
          href="/api/admin/users/csv?template=1"
          className="text-sm text-blue-600 hover:underline"
          download
        >
          Download template
        </a>
      </div>

      {report ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm space-y-2">
          <div>
            <strong>{report.invited}</strong> new users invited (email confirmation sent),{" "}
            <strong>{report.updated}</strong> existing users updated,{" "}
            <strong>{report.skipped}</strong> rows skipped.
          </div>
          {report.errors.length > 0 ? (
            <details>
              <summary className="cursor-pointer text-red-700 font-medium">
                {report.errors.length} errors
              </summary>
              <ul className="mt-2 ml-4 list-disc text-red-700 text-xs">
                {report.errors.slice(0, 50).map((e, i) => (
                  <li key={i}>
                    Row {e.row}{e.email ? ` (${e.email})` : ""}: {e.error}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
