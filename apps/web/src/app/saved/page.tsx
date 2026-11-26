import type { Metadata } from "next";
import { SavedBoard } from "@/components/saved/saved-board";

export const metadata: Metadata = {
  title: "Saved jobs & application tracker",
  description: "Your saved jobs and a simple application tracker — saved, applied, interviewing, offer. Stored only in this browser.",
  alternates: { canonical: "/saved" },
  robots: { index: false, follow: true },
};

export default function SavedPage(): React.JSX.Element {
  return (
    <div className="container-page max-w-[960px] pt-12 sm:pt-16">
      <h1 className="text-[34px] font-semibold tracking-[-0.04em] sm:text-[40px]">Saved jobs</h1>
      <p className="mt-2 text-[15px] text-muted-foreground">Track every application from saved to offer. Stored privately in this browser.</p>
      <div className="mt-8">
        <SavedBoard />
      </div>
    </div>
  );
}
