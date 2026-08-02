import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80",
        outline: "border-border/80 bg-muted/40 text-muted-foreground",
        cyan: "border-neon-cyan/30 bg-neon-cyan/10 text-neon-cyan",
        purple: "border-neon-purple/30 bg-neon-purple/10 text-neon-purple",
        lime: "border-neon-lime/30 bg-neon-lime/10 text-neon-lime",
        pink: "border-neon-pink/30 bg-neon-pink/10 text-neon-pink",
        amber: "border-neon-amber/30 bg-neon-amber/10 text-neon-amber",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
