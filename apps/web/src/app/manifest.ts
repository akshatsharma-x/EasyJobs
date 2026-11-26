import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "EasyJobs",
    short_name: "EasyJobs",
    description: "Every internship and job. The minute it's posted.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#2b5cff",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
