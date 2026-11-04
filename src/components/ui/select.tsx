import { ChevronDown } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

/** Native select styled like Input; keeps phone keyboards and screen readers happy. */
function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <span className="relative inline-flex w-full">
      <select
        data-slot="select"
        className={cn(
          "h-11 w-full appearance-none rounded-sm border border-hairline-strong bg-surface-sunken pr-9 pl-3.5 body-md text-foreground transition-[border-color] duration-(--duration-hover) outline-none hover:border-foreground/30 focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent disabled:opacity-50",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-meta"
      />
    </span>
  );
}

export { NativeSelect };
