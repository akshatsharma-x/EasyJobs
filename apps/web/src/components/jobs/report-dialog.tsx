"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { notify } from "@/lib/notify";

const REPORT_REASONS = ["Job is closed or expired", "Wrong details (salary, location…)", "Looks like spam or a scam", "Duplicate listing", "Something else"];

/** Report form (loaded on first use). Reports are kept locally until the API exposes an endpoint (see docs/contract-requests/P01.md). */
export function ReportDialog({ job, open, onOpenChange }: { job: { id: string; title: string }; open: boolean; onOpenChange: (open: boolean) => void }): React.JSX.Element {
  const [reason, setReason] = useState(REPORT_REASONS[0] ?? "");
  const [details, setDetails] = useState("");
  const submit = (): void => {
    try {
      const key = "easyjobs:reports";
      const existing = JSON.parse(localStorage.getItem(key) ?? "[]") as unknown[];
      localStorage.setItem(key, JSON.stringify([...existing, { id: job.id, reason, details, at: new Date().toISOString() }].slice(-50)));
    } catch {
      /* storage unavailable — the toast still confirms */
    }
    onOpenChange(false);
    setDetails("");
    notify.success("Thanks — we'll review this listing", { description: reason });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle className="text-base font-semibold">Report this listing</DialogTitle>
        <DialogDescription className="mt-1 text-sm text-muted-foreground">{job.title}</DialogDescription>
        <fieldset className="mt-5 grid gap-1.5">
          <legend className="sr-only">Reason</legend>
          {REPORT_REASONS.map((r) => (
            <label key={r} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-sm transition-colors has-[:checked]:border-brand/50 has-[:checked]:bg-brand-soft">
              <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="accent-[var(--brand)]" />
              {r}
            </label>
          ))}
        </fieldset>
        <label className="mt-4 block text-sm font-medium" htmlFor="report-details">
          Details <span className="font-normal text-subtle-foreground">(optional)</span>
        </label>
        <Textarea id="report-details" rows={3} value={details} onChange={(e) => setDetails(e.target.value)} className="mt-1.5" />
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>Send report</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
