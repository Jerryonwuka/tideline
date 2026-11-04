import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Brand buttons (Figma 07 — Components): mono caps label in brackets, 4 px corners.
 * Hover: an accent fill sweeps in from the left (600 ms expo-out) and the label slides.
 * One primary action per view.
 */
const buttonVariants = cva(
  "group/button relative isolate inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-sm border whitespace-nowrap outline-none select-none transition-[color,border-color,background-color] duration-(--duration-tide) ease-tide focus-visible:outline-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-40 aria-invalid:border-danger [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary: "border-primary bg-primary text-primary-foreground hover:border-accent hover:text-accent-foreground",
        secondary:
          "border-hairline-strong bg-transparent text-foreground hover:border-accent hover:text-accent-foreground",
        ghost: "border-transparent bg-transparent text-body hover:bg-surface-raised hover:text-foreground",
        danger: "border-danger/40 bg-transparent text-danger hover:bg-danger hover:text-white",
        link: "h-auto border-transparent px-0 text-accent underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 label-mono-sm",
        md: "h-10 px-4 label-mono",
        lg: "h-12 px-6 label-mono",
        icon: "size-10",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

const SWEEPS = new Set(["primary", "secondary"]);

type ButtonProps = ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & {
    /** Wrap the label in mono brackets: [ BOOK A DEMO ]. On by default for primary/secondary. */
    bracketed?: boolean;
  };

function Button({ className, variant = "primary", size = "md", bracketed, children, ...props }: ButtonProps) {
  const sweep = SWEEPS.has(variant ?? "primary");
  const brackets = bracketed ?? (sweep && size !== "icon" && size !== "icon-sm");
  return (
    <ButtonPrimitive
      data-slot="button"
      data-variant={variant}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {sweep && (
        <span
          aria-hidden
          className="absolute inset-0 -z-10 origin-left scale-x-0 bg-accent transition-transform duration-(--duration-reveal) ease-expo group-hover/button:scale-x-100"
        />
      )}
      <span className="inline-flex items-center gap-2 transition-transform duration-(--duration-tide) ease-tide group-hover/button:translate-x-0.5">
        {brackets && <span aria-hidden>[</span>}
        {children}
        {brackets && <span aria-hidden>]</span>}
      </span>
    </ButtonPrimitive>
  );
}

export { Button, buttonVariants };
