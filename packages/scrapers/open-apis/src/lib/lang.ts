/** Tiny stop-word language check: share of English among English/German/French/Dutch function words. */

const EN = /\b(the|and|with|for|you|your|our|we|are|will|this|that|of|to|in|on|is|be|as|an|or)\b/gi;
const OTHER =
  /\b(und|der|die|das|mit|für|wir|sie|du|bei|ist|ein|eine|nicht|auch|oder|les|des|une|avec|pour|nous|vous|est|dans|sur|het|een|voor|wij|zijn|niet|ook|van)\b/gi;

/** 0..1; returns 1 for empty/very short text (no evidence against English). */
export function englishShare(text: string | null | undefined): number {
  if (!text) return 1;
  const sample = text.slice(0, 6000);
  const en = sample.match(EN)?.length ?? 0;
  const other = sample.match(OTHER)?.length ?? 0;
  if (en + other < 8) return 1;
  return en / (en + other);
}
