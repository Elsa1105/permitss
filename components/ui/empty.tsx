import * as React from "react";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ title, description, action, className }: Props) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center py-12 px-4 border-2 border-dashed border-slate-200 rounded-lg bg-white",
        className,
      )}
    >
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      {description ? (
        <p className="text-sm text-slate-500 mt-1 max-w-md">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
