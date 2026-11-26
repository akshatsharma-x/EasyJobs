import * as React from "react";
import { cn } from "@/lib/cn";

export function Skeleton({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element {
  return <div aria-hidden="true" className={cn("skeleton", className)} {...props} />;
}
