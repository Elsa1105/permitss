import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "default" | "sm" | "lg";

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const VARIANT: Record<Variant, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  danger: "btn-danger",
  ghost: "btn-ghost",
};

const SIZE: Record<Size, string> = {
  default: "touch-target",
  sm: "px-3 py-2 text-sm",
  lg: "px-6 py-3 text-base touch-target",
};

export const Button = React.forwardRef<HTMLButtonElement, Props>(
  function Button(
    { className, variant = "primary", size = "default", loading, disabled, children, ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        className={cn(VARIANT[variant], SIZE[size], className)}
        disabled={disabled || loading}
        {...rest}
      >
        {loading ? (
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : null}
        {children}
      </button>
    );
  },
);
