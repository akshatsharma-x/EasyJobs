import { ImageResponse } from "next/og";

export const alt = "EasyJobs — Every internship and job. The minute it's posted.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage(): ImageResponse {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 88, background: "#ffffff", color: "#09090b" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: "#2b5cff", display: "flex", flexDirection: "column", justifyContent: "center", gap: 6, padding: "0 13px" }}>
            <div style={{ height: 6, width: 30, borderRadius: 3, background: "#fff" }} />
            <div style={{ height: 6, width: 21, borderRadius: 3, background: "rgba(255,255,255,.78)" }} />
            <div style={{ height: 6, width: 13, borderRadius: 3, background: "rgba(255,255,255,.55)" }} />
          </div>
          <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1.5 }}>EasyJobs</div>
        </div>
        <div style={{ marginTop: 56, fontSize: 84, fontWeight: 700, letterSpacing: -4, lineHeight: 1.02, display: "flex", flexDirection: "column" }}>
          <span>Every internship and job.</span>
          <span style={{ display: "flex" }}>
            The&nbsp;<span style={{ color: "#2b5cff" }}>minute</span>&nbsp;it&apos;s posted.
          </span>
        </div>
        <div style={{ marginTop: 36, fontSize: 30, color: "#52525b" }}>1,000+ official career sites and top job boards, every few minutes.</div>
      </div>
    ),
    size,
  );
}
