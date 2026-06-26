"use client";

import * as React from "react";
import { FileText, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createBrowserSupabase } from "@/lib/supabase/client";
import type { PermitDocumentRow } from "@/lib/supabase/types";

const DOCUMENT_TYPES = [
  { value: "risk_assessment", label: "Risk Assessment / RA" },
  { value: "jsa", label: "JSA" },
  { value: "method_statement", label: "Method Statement" },
  { value: "gas_test_record", label: "Gas Test Record" },
  { value: "other", label: "Other Supporting Document" },
];

const MAX_FILE_SIZE = 10 * 1024 * 1024;

interface Props {
  permitId: string;
  bucket?: string;
  initialDocuments?: (PermitDocumentRow & { signedUrl?: string })[];
  disabled?: boolean;
}

function safeFileName(name: string) {
  return name
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
}

export function DocumentUploader({
  permitId,
  bucket = "permit-documents",
  initialDocuments = [],
  disabled,
}: Props) {
  const supabase = createBrowserSupabase();

  const [documents, setDocuments] = React.useState(initialDocuments);
  const [documentType, setDocumentType] = React.useState("risk_assessment");
  const [uploading, setUploading] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  async function uploadDocument(file: File) {
    if (disabled) {
      toast.error("Document upload is disabled for this permit state.");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast.error("File too large. Maximum file size is 10 MB.");
      return;
    }

    setUploading(true);

    try {
      const documentId = crypto.randomUUID();
      const cleanName = safeFileName(file.name);
      const storagePath = `${permitId}/${documentId}-${cleanName}`;

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(storagePath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || "application/octet-stream",
        });

      if (uploadError) {
        toast.error(uploadError.message);
        return;
      }

      const { data, error: insertError } = await supabase
        .from("permit_documents")
        .insert({
          id: documentId,
          permit_id: permitId,
          uploaded_by: (await supabase.auth.getUser()).data.user?.id,
          document_type: documentType,
          file_name: file.name,
          storage_path: storagePath,
          mime_type: file.type || null,
          file_size: file.size,
        })
        .select("*")
        .single();

      if (insertError) {
        await supabase.storage.from(bucket).remove([storagePath]);
        toast.error(insertError.message);
        return;
      }

      setDocuments((current) => [...current, data as PermitDocumentRow]);
      toast.success("Document uploaded");
    } catch {
      toast.error("Document upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function openDocument(doc: PermitDocumentRow & { signedUrl?: string }) {
    if (doc.signedUrl) {
      window.open(doc.signedUrl, "_blank", "noopener,noreferrer");
      return;
    }

    setBusyId(doc.id);

    try {
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(doc.storage_path, 60);

      if (error || !data?.signedUrl) {
        toast.error(error?.message || "Failed to open document");
        return;
      }

      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteDocument(doc: PermitDocumentRow) {
    if (disabled) {
      toast.error("Document delete is disabled for this permit state.");
      return;
    }

    if (!confirm(`Delete ${doc.file_name}?`)) return;

    setBusyId(doc.id);

    try {
      const { error: storageError } = await supabase.storage
        .from(bucket)
        .remove([doc.storage_path]);

      if (storageError) {
        toast.error(storageError.message);
        return;
      }

      const { error: dbError } = await supabase
        .from("permit_documents")
        .delete()
        .eq("id", doc.id);

      if (dbError) {
        toast.error(dbError.message);
        return;
      }

      setDocuments((current) => current.filter((item) => item.id !== doc.id));
      toast.success("Document deleted");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      {!disabled ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Upload Supporting Document
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Upload RA, JSA, method statement, gas test record, or other
              supporting document.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-3">
            <label className="field">
              <span className="field-label">Document Type</span>
              <select
                className="input"
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value)}
              >
                {DOCUMENT_TYPES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
              <Upload className="h-4 w-4" />
              <span>{uploading ? "Uploading..." : "Choose File"}</span>
              <input
                type="file"
                className="sr-only"
                disabled={uploading}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void uploadDocument(file);
                }}
              />
            </label>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          Document upload is only available while the permit is still editable.
        </p>
      )}

      {documents.length ? (
        <div className="space-y-2">
          {documents.map((doc) => {
            const typeLabel =
              DOCUMENT_TYPES.find((item) => item.value === doc.document_type)
                ?.label ?? doc.document_type;

            return (
              <div
                key={doc.id}
                className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white p-3"
              >
                <div className="min-w-0 flex items-start gap-3">
                  <FileText className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />
                  <div className="min-w-0">
                    <button
                      type="button"
                      className="block truncate text-left text-sm font-medium text-blue-700 hover:underline"
                      disabled={busyId === doc.id}
                      onClick={() => openDocument(doc)}
                    >
                      {doc.file_name}
                    </button>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {typeLabel}
                      {doc.file_size
                        ? ` • ${(doc.file_size / 1024 / 1024).toFixed(2)} MB`
                        : ""}
                    </p>
                  </div>
                </div>

                {!disabled ? (
                  <Button
                    type="button"
                    variant="ghost"
                    loading={busyId === doc.id}
                    onClick={() => deleteDocument(doc)}
                    title="Delete document"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-slate-200 bg-white p-4 text-center text-sm text-slate-500">
          No supporting documents uploaded yet.
        </div>
      )}
    </div>
  );
}