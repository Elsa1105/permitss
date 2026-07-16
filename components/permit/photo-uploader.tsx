"use client";

import * as React from "react";
import { Camera, Image as ImageIcon, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { PhotoAnnotator, type Annotation } from "./photo-annotator";
import type { PermitPhotoRow } from "@/lib/supabase/types";

const MAX_PHOTOS = 5;
const MAX_UPLOAD_DIM = 1920;
const JPEG_QUALITY = 0.85;

/**
 * Downscales a captured photo to MAX_UPLOAD_DIM on its longest side and
 * re-encodes as JPEG. iPad camera photos are typically 4032×3024 ≈ 4 MB,
 * which decodes to ~48 MB of RGBA at view time --- enough to crash the
 * Safari renderer when several are open. Resizing on upload keeps both the
 * stored file and the in-memory decode small, and strips EXIF orientation
 * (the canvas re-encode honours it via createImageBitmap's
 * imageOrientation: "from-image" default).
 */
async function downscaleImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (typeof createImageBitmap !== "function") return file;

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height);
    if (longest <= MAX_UPLOAD_DIM) return file; // Already small enough

    const scale = MAX_UPLOAD_DIM / longest;
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob) return file;
    const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg", lastModified: Date.now() });
  } catch (e) {
    console.warn("downscale failed, uploading original", e);
    return file;
  } finally {
    bitmap?.close();
  }
}

interface Props {
  permitId: string;
  bucket: string;
  initialPhotos: (PermitPhotoRow & { signedUrl: string })[];
  disabled?: boolean;
  /** Show a "Photo Comment" field under each photo (e.g. Stage II Not Fit evidence). */
  showCaptions?: boolean;
  captionLabel?: string;
  captionPlaceholder?: string;
}

export function PhotoUploader({
  permitId,
  bucket,
  initialPhotos,
  disabled,
  showCaptions = false,
  captionLabel = "Photo Comment",
  captionPlaceholder = "Describe what this photo shows…",
}: Props) {
  const [photos, setPhotos] = React.useState(initialPhotos);
  const [uploading, setUploading] = React.useState(false);
  const [savingCaptionId, setSavingCaptionId] = React.useState<string | null>(
    null,
  );
  const [editing, setEditing] = React.useState<{
    id: string;
    url: string;
    annotation: Annotation[];
  } | null>(null);
  const cameraRef = React.useRef<HTMLInputElement>(null);
  const galleryRef = React.useRef<HTMLInputElement>(null);

  async function uploadFile(rawFile: File) {
    if (photos.length >= MAX_PHOTOS) {
      toast.error(`Maximum ${MAX_PHOTOS} photos per permit`);
      return;
    }
    setUploading(true);
    try {
      const file = await downscaleImage(rawFile);
      const supabase = createBrowserSupabase();
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const photoId = crypto.randomUUID();
      const path = `${permitId}/${photoId}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from(bucket)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) {
        toast.error(upErr.message);
        return;
      }

      // Insert metadata row
      const { data: row, error: insErr } = await supabase
        .from("permit_photos")
        .insert({
          id: photoId,
          permit_id: permitId,
          storage_path: path,
          uploaded_by: (await supabase.auth.getUser()).data.user!.id,
        })
        .select("*")
        .single();
      if (insErr || !row) {
        toast.error(insErr?.message ?? "Failed to save photo");
        return;
      }

      const { data: signed } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, 60 * 60);

      setPhotos((s) => [
        ...s,
        { ...(row as PermitPhotoRow), signedUrl: signed?.signedUrl ?? "" },
      ]);
      toast.success("Photo uploaded");
    } finally {
      setUploading(false);
    }
  }

  async function deletePhoto(p: PermitPhotoRow & { signedUrl: string }) {
    if (!confirm("Delete this photo?")) return;
    const supabase = createBrowserSupabase();
    const del = await supabase.from("permit_photos").delete().eq("id", p.id);
    if (del.error) {
      toast.error(del.error.message);
      return;
    }
    await supabase.storage.from(bucket).remove([p.storage_path]);
    setPhotos((s) => s.filter((x) => x.id !== p.id));
    toast.success("Photo removed");
  }

  async function saveCaption(photoId: string, caption: string) {
    const supabase = createBrowserSupabase();
    setSavingCaptionId(photoId);
    try {
      const { error } = await supabase
        .from("permit_photos")
        .update({ caption: caption.trim() || null })
        .eq("id", photoId);
      if (error) {
        toast.error(error.message);
        return;
      }
      setPhotos((s) =>
        s.map((p) =>
          p.id === photoId ? { ...p, caption: caption.trim() || null } : p,
        ),
      );
      toast.success("Comment saved");
    } finally {
      setSavingCaptionId(null);
    }
  }

  async function saveAnnotation(annotations: Annotation[]) {
    if (!editing) return;
    const supabase = createBrowserSupabase();
    const { error } = await supabase
      .from("permit_photos")
      .update({ annotation_data: { annotations } })
      .eq("id", editing.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setPhotos((s) =>
      s.map((p) =>
        p.id === editing.id
          ? { ...p, annotation_data: { annotations } }
          : p,
      ),
    );
    setEditing(null);
    toast.success("Annotation saved");
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])}
        />
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])}
        />
        <Button
          type="button"
          variant="secondary"
          onClick={() => cameraRef.current?.click()}
          disabled={disabled || uploading || photos.length >= MAX_PHOTOS}
        >
          <Camera className="h-5 w-5" /> Take photo
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => galleryRef.current?.click()}
          disabled={disabled || uploading || photos.length >= MAX_PHOTOS}
        >
          <ImageIcon className="h-5 w-5" /> Upload from gallery
        </Button>
        <span className="text-xs text-slate-500 ml-auto">
          {photos.length} / {MAX_PHOTOS} photos
        </span>
      </div>

      {photos.length === 0 ? (
        <div className="border-2 border-dashed border-slate-200 rounded-lg p-8 text-center text-sm text-slate-500">
          No photos yet. Capture or upload a photo / sketch of the work area.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {photos.map((p) => (
            <div key={p.id} className="space-y-1.5">
              <div className="relative group rounded-lg overflow-hidden border border-slate-200 bg-slate-100 aspect-video">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.signedUrl}
                  alt="Permit photo"
                  className="absolute inset-0 w-full h-full object-cover"
                />
                {!disabled ? (
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-end justify-end p-2 gap-2 opacity-0 group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() =>
                        setEditing({
                          id: p.id,
                          url: p.signedUrl,
                          annotation:
                            ((p.annotation_data as { annotations?: Annotation[] } | null)
                              ?.annotations ?? []) as Annotation[],
                        })
                      }
                      className="p-2 rounded-md bg-white/90 hover:bg-white"
                      aria-label="Annotate"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deletePhoto(p)}
                      className="p-2 rounded-md bg-white/90 hover:bg-white text-red-600"
                      aria-label="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ) : null}
                {(p.annotation_data as { annotations?: Annotation[] } | null)?.annotations
                  ?.length ? (
                  <div className="absolute top-2 left-2 bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full">
                    Annotated
                  </div>
                ) : null}
              </div>

              {showCaptions ? (
                <CaptionField
                  photoId={p.id}
                  label={captionLabel}
                  placeholder={captionPlaceholder}
                  initialValue={p.caption ?? ""}
                  disabled={disabled}
                  saving={savingCaptionId === p.id}
                  onSave={(value) => saveCaption(p.id, value)}
                />
              ) : p.caption ? (
                <p className="text-xs text-slate-600 italic">“{p.caption}”</p>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {editing ? (
        <PhotoAnnotator
          imageUrl={editing.url}
          initial={editing.annotation}
          onClose={() => setEditing(null)}
          onSave={saveAnnotation}
        />
      ) : null}
    </div>
  );
}

function CaptionField({
  photoId,
  label,
  placeholder,
  initialValue,
  disabled,
  saving,
  onSave,
}: {
  photoId: string;
  label: string;
  placeholder: string;
  initialValue: string;
  disabled?: boolean;
  saving: boolean;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = React.useState(initialValue);

  React.useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  return (
    <Textarea
      label={label}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      rows={2}
      className="text-xs"
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (value.trim() !== (initialValue ?? "").trim()) onSave(value);
      }}
      hint={saving ? "Saving comment…" : undefined}
    />
  );
}
