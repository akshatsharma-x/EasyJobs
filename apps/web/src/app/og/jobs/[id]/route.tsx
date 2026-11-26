import { ImageResponse } from "next/og";
import { api } from "@/lib/api";
import { formatExperience, formatLocations, formatSalary } from "@/lib/format";

export const revalidate = 3600;

/** 1200×630 Open Graph card for a job (next/og). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const job = await api.getJob(decodeURIComponent(id));
  const title = job?.title ?? "Job not found";
  const company = job?.company.name ?? "EasyJobs";
  const facts = job
    ? [
        formatLocations(job.locations, job.isRemote),
        formatExperience(job.experienceMin, job.experienceMax, job.experienceLevel),
        (formatSalary(job.salary) ?? "").replace("₹", "INR "),
      ].filter(Boolean)
    : [];
  const initial = company.charAt(0).toUpperCase();

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#ffffff", color: "#09090b", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "#2b5cff", display: "flex", flexDirection: "column", justifyContent: "center", gap: 5, padding: "0 10px" }}>
            <div style={{ height: 5, width: 24, borderRadius: 3, background: "#fff" }} />
            <div style={{ height: 5, width: 17, borderRadius: 3, background: "rgba(255,255,255,.78)" }} />
            <div style={{ height: 5, width: 10, borderRadius: 3, background: "rgba(255,255,255,.55)" }} />
          </div>
          <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: -1 }}>EasyJobs</div>
          {job?.isOfficial && (
            <div style={{ marginLeft: "auto", fontSize: 24, color: "#2250e8", background: "rgba(43,92,255,.08)", padding: "8px 18px", borderRadius: 999 }}>Official listing</div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ width: 64, height: 64, borderRadius: 16, border: "2px solid #e6e6e9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 700, color: "#2250e8" }}>
              {initial}
            </div>
            <div style={{ fontSize: 34, color: "#52525b" }}>{company}</div>
          </div>
          <div style={{ fontSize: title.length > 48 ? 58 : 70, fontWeight: 700, letterSpacing: -2.5, lineHeight: 1.05, maxWidth: 1000 }}>{title}</div>
          <div style={{ display: "flex", gap: 14 }}>
            {facts.map((f) => (
              <div key={f} style={{ fontSize: 26, padding: "10px 20px", borderRadius: 14, border: "2px solid #e6e6e9", color: "#3f3f46" }}>
                {f}
              </div>
            ))}
          </div>
        </div>
        <div style={{ fontSize: 24, color: "#71717a" }}>Every internship and job. The minute it&apos;s posted.</div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
