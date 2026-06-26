"use client";

import * as React from "react";
import {
  ArrowRight,
  Circle,
  Pencil,
  RotateCcw,
  Save,
  Type,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Tool = "arrow" | "circle" | "freehand" | "text";

interface Point {
  x: number;
  y: number;
}

interface Annotation {
  tool: Tool;
  color?: string | null;
  points?: Point[];
  rect?: { x: number; y: number; w: number; h: number };
  start?: Point;
  end?: Point;
  text?: string;
}

interface Props {
  imageUrl: string;
  initial?: Annotation[];
  onClose: () => void;
  onSave: (annotations: Annotation[]) => void | Promise<void>;
}

const COLORS = ["#dc2626", "#facc15", "#16a34a", "#2563eb", "#1f2937"];
const DEFAULT_COLOR = "#dc2626";
const MAX_DECODED_DIM = 1600;

function sanitizeAnnotation(annotation: Annotation | null | undefined): Annotation | null {
  if (!annotation) return null;

  const safeColor = annotation.color || DEFAULT_COLOR;

  return {
    ...annotation,
    color: safeColor,
  };
}

function sanitizeAnnotations(annotations: Array<Annotation | null | undefined>): Annotation[] {
  return annotations
    .map((annotation) => sanitizeAnnotation(annotation))
    .filter((annotation): annotation is Annotation => Boolean(annotation));
}

export function PhotoAnnotator({
  imageUrl,
  initial = [],
  onClose,
  onSave,
}: Props) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const imgRef = React.useRef<HTMLImageElement | ImageBitmap | null>(null);
  const naturalSizeRef = React.useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const sizeRef = React.useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const rafRef = React.useRef(0);

  const [tool, setTool] = React.useState<Tool>("arrow");
  const [color, setColor] = React.useState(DEFAULT_COLOR);
  const [annotations, setAnnotations] = React.useState<Annotation[]>(() =>
    sanitizeAnnotations(initial),
  );

  const drawingRef = React.useRef<Annotation | null>(null);
  const [textPrompt, setTextPrompt] = React.useState<Point | null>(null);
  const [pendingText, setPendingText] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [imgError, setImgError] = React.useState(false);

  React.useEffect(() => {
    setAnnotations(sanitizeAnnotations(initial));
  }, [initial]);

  React.useEffect(() => {
    let cancelled = false;
    let createdBitmap: ImageBitmap | null = null;
    let objectUrl: string | null = null;

    async function loadImage() {
      try {
        setImgError(false);

        const res = await fetch(imageUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const blob = await res.blob();
        if (cancelled) return;

        if (typeof createImageBitmap === "function") {
          const probe = await createImageBitmap(blob);
          if (cancelled) {
            probe.close();
            return;
          }

          naturalSizeRef.current = { w: probe.width, h: probe.height };
          const longest = Math.max(probe.width, probe.height);

          if (longest > MAX_DECODED_DIM) {
            const scale = MAX_DECODED_DIM / longest;
            const tw = Math.round(probe.width * scale);
            const th = Math.round(probe.height * scale);

            probe.close();

            createdBitmap = await createImageBitmap(blob, {
              resizeWidth: tw,
              resizeHeight: th,
              resizeQuality: "medium",
            });
          } else {
            createdBitmap = probe;
          }

          if (cancelled) {
            createdBitmap.close();
            return;
          }

          imgRef.current = createdBitmap;
        } else {
          objectUrl = URL.createObjectURL(blob);
          const img = new Image();

          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error("img load"));
            img.src = objectUrl!;
          });

          if (cancelled) return;

          naturalSizeRef.current = {
            w: img.naturalWidth,
            h: img.naturalHeight,
          };
          imgRef.current = img;
        }

        fitCanvas();
      } catch (err) {
        if (!cancelled) {
          console.error("annotator: image load failed", err);
          setImgError(true);
        }
      }
    }

    loadImage();

    return () => {
      cancelled = true;
      if (createdBitmap) createdBitmap.close();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      imgRef.current = null;
    };
  }, [imageUrl]);

  React.useEffect(() => {
    let frame = 0;

    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fitCanvas);
    };

    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  React.useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  React.useEffect(() => {
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotations]);

  function fitCanvas() {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    const container = containerRef.current;

    if (!canvas || !img || !container) return;

    const natural = naturalSizeRef.current;
    if (natural.w === 0 || natural.h === 0) return;

    const containerWidth = Math.max(1, container.clientWidth - 16);
    const containerHeight = Math.max(1, container.clientHeight - 16);
    const aspect = natural.h / natural.w;

    let w = Math.min(containerWidth, natural.w);
    let h = w * aspect;

    if (h > containerHeight) {
      h = containerHeight;
      w = h / aspect;
    }

    const dpr = Math.min(1.5, window.devicePixelRatio || 1);

    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);

    sizeRef.current = { w, h };
    redraw();
  }

  function scheduleRedraw() {
    if (rafRef.current) return;

    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      redraw();
    });
  }

  function redraw() {
    const canvas = canvasRef.current;
    const img = imgRef.current;

    if (!canvas || !img) return;

    const { w, h } = sizeRef.current;
    if (w === 0 || h === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(1.5, window.devicePixelRatio || 1);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    try {
      ctx.drawImage(img as CanvasImageSource, 0, 0, w, h);
    } catch (e) {
      console.warn("drawImage failed", e);
      return;
    }

    const activeDrawing = sanitizeAnnotation(drawingRef.current);
    const all = activeDrawing ? [...annotations, activeDrawing] : annotations;

    for (const annotation of all) {
      drawAnnotation(ctx, annotation, w, h);
    }
  }

  function pointFromEvent(e: React.PointerEvent): Point {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();

    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  }

  function onPointerDown(e: React.PointerEvent) {
    if (textPrompt) return;

    e.preventDefault();

    try {
      canvasRef.current?.setPointerCapture(e.pointerId);
    } catch {
      // Some browsers/webviews do not support pointer capture.
    }

    const p = pointFromEvent(e);
    const safeColor = color || DEFAULT_COLOR;

    if (tool === "text") {
      setTextPrompt(p);
      return;
    }

    drawingRef.current =
      tool === "freehand"
        ? { tool, color: safeColor, points: [p] }
        : { tool, color: safeColor, start: p, end: p };

    scheduleRedraw();
  }

  function onPointerMove(e: React.PointerEvent) {
    const drawing = drawingRef.current;
    if (!drawing) return;

    const p = pointFromEvent(e);

    if (drawing.tool === "freehand") {
      const pts = drawing.points ?? [];
      const last = pts[pts.length - 1];

      if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 0.001) {
        pts.push(p);
        drawing.points = pts;
      }
    } else {
      drawing.end = p;
    }

    scheduleRedraw();
  }

  function onPointerUp(e?: React.PointerEvent) {
    if (e) {
      try {
        canvasRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        // Safe to ignore.
      }
    }

    const drawing = sanitizeAnnotation(drawingRef.current);
    if (!drawing) return;

    drawingRef.current = null;

    setAnnotations((current) => sanitizeAnnotations([...current, drawing]));
  }

  function commitText() {
    if (!textPrompt || !pendingText.trim()) {
      setTextPrompt(null);
      setPendingText("");
      return;
    }

    const textAnnotation: Annotation = {
      tool: "text",
      color: color || DEFAULT_COLOR,
      start: textPrompt,
      text: pendingText.trim(),
    };

    setAnnotations((current) => sanitizeAnnotations([...current, textAnnotation]));

    setTextPrompt(null);
    setPendingText("");
  }

  function undo() {
    drawingRef.current = null;
    setAnnotations((current) => current.slice(0, -1));
  }

  async function handleSave() {
    setSaving(true);

    try {
      const cleaned = sanitizeAnnotations(annotations);
      setAnnotations(cleaned);
      await onSave(cleaned);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/90 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3 p-3 border-b border-slate-700 bg-slate-900 text-slate-100">
        <div className="flex items-center gap-2 overflow-x-auto">
          <ToolButton
            active={tool === "arrow"}
            onClick={() => setTool("arrow")}
            title="Arrow"
          >
            <ArrowRight className="h-5 w-5" />
          </ToolButton>

          <ToolButton
            active={tool === "circle"}
            onClick={() => setTool("circle")}
            title="Circle"
          >
            <Circle className="h-5 w-5" />
          </ToolButton>

          <ToolButton
            active={tool === "freehand"}
            onClick={() => setTool("freehand")}
            title="Freehand"
          >
            <Pencil className="h-5 w-5" />
          </ToolButton>

          <ToolButton
            active={tool === "text"}
            onClick={() => setTool("text")}
            title="Text label"
          >
            <Type className="h-5 w-5" />
          </ToolButton>

          <div className="mx-2 h-6 w-px bg-slate-700" />

          <div className="flex items-center gap-1.5">
            {COLORS.map((presetColor) => (
              <button
                key={presetColor}
                type="button"
                onClick={() => setColor(presetColor)}
                aria-label={`Color ${presetColor}`}
                title={presetColor}
                style={{ background: presetColor }}
                className={cn(
                  "h-7 w-7 rounded-full border-2 transition-transform",
                  color === presetColor
                    ? "border-white scale-110"
                    : "border-slate-700",
                )}
              />
            ))}

            <label
              className="ml-2 flex items-center gap-2 rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-200"
              title="Choose custom color"
            >
              Custom
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-7 w-8 cursor-pointer rounded border border-slate-600 bg-transparent"
                aria-label="Choose custom annotation color"
              />
            </label>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={undo}
            disabled={annotations.length === 0 && !drawingRef.current}
            className="px-3 py-2 rounded-md text-slate-200 hover:bg-slate-800 inline-flex items-center gap-1.5 text-sm disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" /> Undo
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded-md text-slate-200 hover:bg-slate-800"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 inline-flex items-center gap-2 text-sm font-medium disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="flex-1 overflow-auto p-4 grid place-items-center"
      >
        {imgError ? (
          <div className="text-center text-slate-200 max-w-md p-6">
            <h3 className="font-semibold mb-2">Couldn&rsquo;t load this photo</h3>
            <p className="text-sm text-slate-400">
              The signed download link may have expired. Close this window and
              reopen the photo from the permit detail.
            </p>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            className="touch-none rounded-md shadow-xl bg-white max-w-full"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerLeave={(e) => {
              if (drawingRef.current) onPointerUp(e);
            }}
          />
        )}
      </div>

      {textPrompt ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg p-4 w-80 shadow-xl">
            <h3 className="font-semibold mb-2">Add label</h3>

            <input
              autoFocus
              className="input"
              value={pendingText}
              onChange={(e) => setPendingText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitText();

                if (e.key === "Escape") {
                  setTextPrompt(null);
                  setPendingText("");
                }
              }}
              placeholder="e.g. Fire extinguisher here"
            />

            <div className="flex justify-end gap-2 mt-3">
              <button
                className="btn-ghost"
                type="button"
                onClick={() => {
                  setTextPrompt(null);
                  setPendingText("");
                }}
              >
                Cancel
              </button>

              <button className="btn-primary" type="button" onClick={commitText}>
                Add
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ToolButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={cn(
        "p-2 rounded-md transition-colors",
        active ? "bg-blue-600 text-white" : "text-slate-200 hover:bg-slate-800",
      )}
    >
      {children}
    </button>
  );
}

function drawAnnotation(
  ctx: CanvasRenderingContext2D,
  annotation: Annotation | null | undefined,
  w: number,
  h: number,
) {
  const a = sanitizeAnnotation(annotation);
  if (!a) return;

  const safeColor = a.color || DEFAULT_COLOR;

  ctx.save();
  ctx.strokeStyle = safeColor;
  ctx.fillStyle = safeColor;
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  if (a.tool === "freehand" && a.points && a.points.length > 0) {
    ctx.beginPath();
    ctx.moveTo(a.points[0].x * w, a.points[0].y * h);

    for (const p of a.points.slice(1)) {
      ctx.lineTo(p.x * w, p.y * h);
    }

    ctx.stroke();
  } else if (a.tool === "circle" && a.start && a.end) {
    const x1 = a.start.x * w;
    const y1 = a.start.y * h;
    const x2 = a.end.x * w;
    const y2 = a.end.y * h;
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const rx = Math.abs(x2 - x1) / 2;
    const ry = Math.abs(y2 - y1) / 2;

    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (a.tool === "arrow" && a.start && a.end) {
    const x1 = a.start.x * w;
    const y1 = a.start.y * h;
    const x2 = a.end.x * w;
    const y2 = a.end.y * h;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    const angle = Math.atan2(y2 - y1, x2 - x1);
    const head = 12;

    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(
      x2 - head * Math.cos(angle - Math.PI / 6),
      y2 - head * Math.sin(angle - Math.PI / 6),
    );
    ctx.lineTo(
      x2 - head * Math.cos(angle + Math.PI / 6),
      y2 - head * Math.sin(angle + Math.PI / 6),
    );
    ctx.closePath();
    ctx.fill();
  } else if (a.tool === "text" && a.start && a.text) {
    const x = a.start.x * w;
    const y = a.start.y * h;

    ctx.font = "bold 16px system-ui, -apple-system, Segoe UI, sans-serif";

    const metrics = ctx.measureText(a.text);
    const padX = 6;
    const padY = 4;
    const boxW = metrics.width + padX * 2;
    const boxH = 16 + padY * 2;

    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.strokeStyle = safeColor;
    ctx.lineWidth = 1.5;

    ctx.fillRect(x, y - 16 - padY, boxW, boxH);
    ctx.strokeRect(x, y - 16 - padY, boxW, boxH);

    ctx.fillStyle = safeColor;
    ctx.fillText(a.text, x + padX, y - 4);
  }

  ctx.restore();
}

export type { Annotation };