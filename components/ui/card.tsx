import * as React from "react";
import { cn } from "@/lib/utils";

export function Card(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cn("card", props.className)} />;
}

export function CardHeader({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4 border-b border-slate-200", className)} {...rest} />;
}

export function CardTitle({ className, ...rest }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-lg font-semibold tracking-tight", className)} {...rest} />;
}

export function CardDescription({ className, ...rest }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-slate-500 mt-1", className)} {...rest} />;
}

export function CardBody({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4", className)} {...rest} />;
}

export function CardFooter({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "p-4 border-t border-slate-200 flex items-center justify-end gap-2 bg-slate-50/60 rounded-b-lg",
        className,
      )}
      {...rest}
    />
  );
}
