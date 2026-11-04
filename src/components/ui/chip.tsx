import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

const DOT: Record<Tone, string> = {
  success: "bg-success text-success",
  warning: "bg-warning text-warning",
  danger: "bg-danger text-danger",
  info: "bg-info text-info",
  neutral: "bg-meta text-meta",
};

/** Status chip: pill, 1 px ring, small signal dot (signals are dots, never large fills). */
function StatusChip({
  tone = "neutral",
  pulse = false,
  className,
  children,
  ...props
}: React.ComponentProps<"span"> & { tone?: Tone; pulse?: boolean }) {
  return (
    <span
      data-slot="status-chip"
      className={cn(
        "inline-flex h-7 items-center gap-2 rounded-pill border border-hairline-strong px-3 text-[0.8125rem] whitespace-nowrap text-foreground",
        className,
      )}
      {...props}
    >
      <span aria-hidden className={cn("size-1.5 rounded-pill", DOT[tone], pulse && "animate-pulse-once")} />
      {children}
    </span>
  );
}

/** Tag: dashed hairline, mono caps, 2 px corners — "NEW", "CERT DUE", section numbers. */
function Tag({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="tag"
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-xs border border-dashed border-accent/50 px-2 label-mono-sm text-accent",
        className,
      )}
      {...props}
    />
  );
}

export { StatusChip, Tag, type Tone };
