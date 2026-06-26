import * as React from "react";
import { cn } from "@/lib/utils";

interface Props extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: React.ReactNode;
  description?: React.ReactNode;
  error?: string;
}

export const Checkbox = React.forwardRef<HTMLInputElement, Props>(
  function Checkbox({ label, description, error, className, id, ...rest }, ref) {
    const fieldId = id || rest.name;
    return (
      <label
        htmlFor={fieldId}
        className={cn(
          "flex items-start gap-3 p-3 rounded-md border border-slate-200 bg-white cursor-pointer hover:bg-slate-50 transition-colors",
          error && "border-red-300",
          rest.checked && "border-blue-400 bg-blue-50/50",
          className,
        )}
      >
        <input ref={ref} id={fieldId} type="checkbox" className="checkbox mt-0.5" {...rest} />
        <div className="flex-1">
          {label ? <div className="text-sm font-medium text-slate-900">{label}</div> : null}
          {description ? (
            <div className="text-xs text-slate-500 mt-0.5">{description}</div>
          ) : null}
          {error ? <div className="text-xs text-red-600 mt-1">{error}</div> : null}
        </div>
      </label>
    );
  },
);
