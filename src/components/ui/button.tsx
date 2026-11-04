import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { Brackets } from "@/components/marketing/brackets";
import { cn } from "@/lib/utils";

/**
 * Buttons: mono caps label, near-square corners. Primary and secondary carry corner marks that
 * spread on hover; the fill brightens. One primary action per view.
 */
const buttonVariants = cva(
  "group/brackets relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xs border whitespace-nowrap outline-none select-none transition-[color,border-color,background-color,box-shadow] duration-(--duration-tide) ease-tide focus-visible:outline-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-40 aria-invalid:border-danger [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary:
          "border-primary bg-primary text-primary-foreground hover:shadow-[0_0_32px_-4px_var(--glow-strong)] dark:hover:bg-white",
        secondary: "border-hairline-strong bg-surface/60 text-foreground backdrop-blur hover:border-foreground/40",
        ghost: "border-transparent bg-transparent text-body hover:bg-surface-raised hover:text-foreground",
        danger: "border-danger/40 bg-transparent text-danger hover:bg-danger hover:text-white",
        link: "h-auto border-transparent px-0 text-accent underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3.5 label-mono-sm",
        md: "h-10 px-5 label-mono",
        lg: "h-12 px-6 label-mono",
        icon: "size-10",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type ButtonProps = ButtonPrimitive.Props & VariantProps<typeof buttonVariants> & { marks?: boolean };

function Button({ className, variant = "primary", size = "md", marks, children, ...props }: ButtonProps) {
  const showMarks = marks ?? ((variant === "primary" || variant === "secondary") && !String(size).startsWith("icon"));
  return (
    <ButtonPrimitive
      data-slot="button"
      data-variant={variant}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {showMarks && <Brackets size={6} offset={4} className="text-foreground/50" />}
      {children}
    </ButtonPrimitive>
  );
}

export { Button, buttonVariants };
