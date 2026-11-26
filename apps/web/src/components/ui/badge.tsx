import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

export const badgeVariants = cva(
  "inline-flex h-[22px] shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 text-xs font-medium leading-none [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        neutral: "bg-muted text-muted-foreground",
        outline: "border border-border text-muted-foreground",
        brand: "bg-brand-soft text-brand-text",
        live: "bg-live-soft text-live-foreground",
        official: "bg-brand-soft text-brand-text",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export interface BadgeProps extends React.ComponentProps<"span">, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps): React.JSX.Element {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}
