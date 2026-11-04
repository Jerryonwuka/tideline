import { cn } from "@/lib/utils";

/**
 * Four L-shaped corner marks around the parent (which must be `relative`). They spread a little
 * when an ancestor with `group/brackets` is hovered.
 */
export function Brackets({
  size = 8,
  offset = 0,
  className,
}: {
  size?: number;
  /** Distance outside the parent's edge, in px. */
  offset?: number;
  className?: string;
}) {
  const corners = [
    "top-0 left-0 border-t border-l -translate-x-(--o) -translate-y-(--o) group-hover/brackets:-translate-x-[calc(var(--o)+3px)] group-hover/brackets:-translate-y-[calc(var(--o)+3px)]",
    "top-0 right-0 border-t border-r translate-x-(--o) -translate-y-(--o) group-hover/brackets:translate-x-[calc(var(--o)+3px)] group-hover/brackets:-translate-y-[calc(var(--o)+3px)]",
    "bottom-0 left-0 border-b border-l -translate-x-(--o) translate-y-(--o) group-hover/brackets:-translate-x-[calc(var(--o)+3px)] group-hover/brackets:translate-y-[calc(var(--o)+3px)]",
    "bottom-0 right-0 border-b border-r translate-x-(--o) translate-y-(--o) group-hover/brackets:translate-x-[calc(var(--o)+3px)] group-hover/brackets:translate-y-[calc(var(--o)+3px)]",
  ];
  return (
    <span
      aria-hidden
      className={cn("pointer-events-none absolute inset-0", className)}
      style={{ "--o": `${offset}px`, "--s": `${size}px` } as React.CSSProperties}
    >
      {corners.map((c) => (
        <span
          key={c}
          className={cn(
            "absolute size-(--s) border-current transition-transform duration-(--duration-tide) ease-tide",
            c,
          )}
        />
      ))}
    </span>
  );
}

/** A square icon tile framed by corner marks, as used at the top of feature cells. */
export function BracketIcon({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "group/brackets relative inline-flex size-12 items-center justify-center text-foreground [&_svg]:size-4",
        className,
      )}
    >
      <Brackets size={7} className="text-foreground/70" />
      {children}
    </span>
  );
}
