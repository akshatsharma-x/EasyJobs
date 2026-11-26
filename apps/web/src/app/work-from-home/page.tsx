import { LANDING_PRESETS } from "@/lib/presets";
import { PresetPage, presetMetadata, type SearchParamsProp } from "@/components/jobs/preset-page";

const preset = LANDING_PRESETS["work-from-home"];
export const metadata = presetMetadata(preset);

export default function Page({ searchParams }: SearchParamsProp): Promise<React.JSX.Element> {
  return PresetPage({ preset, searchParams });
}
