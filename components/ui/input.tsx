import * as React from "react";
import { cn } from "@/lib/utils";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  required?: boolean;
  error?: string;
  hint?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input({ className, label, required, error, hint, id, ...rest }, ref) {
    const fieldId = id || rest.name;
    return (
      <div className="field">
        {label ? (
          <label
            htmlFor={fieldId}
            className={cn("field-label", required && "field-required")}
          >
            {label}
          </label>
        ) : null}
        <input
          ref={ref}
          id={fieldId}
          className={cn("input", error && "border-red-500 focus:ring-red-500", className)}
          aria-invalid={!!error}
          {...rest}
        />
        {hint && !error ? <p className="text-xs text-slate-500">{hint}</p> : null}
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
      </div>
    );
  },
);

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  required?: boolean;
  error?: string;
  hint?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ className, label, required, error, hint, id, ...rest }, ref) {
    const fieldId = id || rest.name;
    return (
      <div className="field">
        {label ? (
          <label
            htmlFor={fieldId}
            className={cn("field-label", required && "field-required")}
          >
            {label}
          </label>
        ) : null}
        <textarea
          ref={ref}
          id={fieldId}
          className={cn("input", error && "border-red-500 focus:ring-red-500", className)}
          aria-invalid={!!error}
          {...rest}
        />
        {hint && !error ? <p className="text-xs text-slate-500">{hint}</p> : null}
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
      </div>
    );
  },
);

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  required?: boolean;
  error?: string;
  options: { value: string; label: string }[];
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  function Select({ className, label, required, error, options, id, ...rest }, ref) {
    const fieldId = id || rest.name;
    return (
      <div className="field">
        {label ? (
          <label
            htmlFor={fieldId}
            className={cn("field-label", required && "field-required")}
          >
            {label}
          </label>
        ) : null}
        <select
          ref={ref}
          id={fieldId}
          className={cn("input", error && "border-red-500", className)}
          {...rest}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
      </div>
    );
  },
);
