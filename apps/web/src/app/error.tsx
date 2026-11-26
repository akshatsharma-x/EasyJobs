"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }): React.JSX.Element {
  useEffect(() => {
    console.error("[easyjobs] page error", error.digest ?? "", error.message);
  }, [error]);
  return (
    <div className="container-page grid min-h-[60dvh] place-items-center py-16">
      <div className="max-w-md text-center">
        <p className="font-mono text-sm font-medium text-danger">Error</p>
        <h1 className="mt-3 text-[30px] font-semibold tracking-[-0.04em]">Something went wrong</h1>
        <p className="mt-3 text-[15px] text-muted-foreground">
          We couldn&apos;t load this page. It&apos;s usually temporary — try again in a moment.
          {error.digest && <span className="mt-2 block font-mono text-xs text-subtle-foreground">Ref {error.digest}</span>}
        </p>
        <div className="mt-8 flex justify-center gap-2">
          <Button onClick={reset}>
            <RotateCcw className="size-4" /> Try again
          </Button>
          <Button asChild variant="outline">
            <Link href="/">Go home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
