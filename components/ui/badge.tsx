import * as React from "react";
import { cn } from "@/lib/utils";

interface Props extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: "neutral" | "info" | "warn" | "ok" | "bad";
}

const TONE: Record<NonNullable<Props["tone"]>, string> = {
  neutral: "bg-slate-100 text-slate-700 border-slate-300",
  info: "bg-blue-50 text-blue-700 border-blue-300",
  warn: "bg-amber-50 text-amber-800 border-amber-300",
  ok: "bg-emerald-50 text-emerald-700 border-emerald-300",
  bad: "bg-red-50 text-red-700 border-red-300",
};

export function Badge({ tone = "neutral", className, ...rest }: Props) {
  return <span className={cn("badge", TONE[tone], className)} {...rest} />;
}
