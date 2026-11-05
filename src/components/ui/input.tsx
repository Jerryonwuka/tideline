import * as React from "react";
import { cn } from "@/lib/utils";

/** Inputs: 4 px corners, sunken fill, hairline border; focus draws a Foam (dark) / Tide (light) ring. */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-sm border border-hairline-strong bg-surface-sunken px-3.5 body-md text-foreground transition-[border-color,box-shadow] duration-(--duration-hover) ease-hover outline-none placeholder:text-meta hover:border-foreground/30 focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger aria-invalid:ring-danger",
        className,
      )}
      {...props}
    />
  );
}

/** Field label: mono caps, meta colour. */
function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label data-slot="label" className={cn("label-mono-sm text-meta", className)} {...props} />;
}

export { Input, Label };
