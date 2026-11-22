// EDQ-BUILD-ADMINGEN-1122-815 — shared prompt template for the admin image
// generator. ONE style for ALL eras (CTO ruling): documentary-photograph
// wording with era-appropriate lighting/clothing/signage constraints.
// Pure module — no I/O, safe to import from client and server code.

export const GENERATOR_POSITIVE_TEMPLATE =
  "Documentary photograph of {title}, {year}, {location}. " +
  "Accurate shadows and era-appropriate lighting for the period. " +
  "Historically accurate clothing, architecture and technology; " +
  "natural expressions; consistent perspective; no digital artifacts. " +
  "Any signage or text must be period-true and legible in the appropriate language.";

export const GENERATOR_NEGATIVE_TEMPLATE =
  "text, watermark, logo, signature, modern objects, anachronistic clothing or vehicles, " +
  "plastic skin, oversaturated colors, cartoon, painting, illustration, collage, " +
  "multiple scenes, frame, border";

/** Signed integer year -> prompt text: negative years render as "N BCE". */
export function formatPromptYear(year: number | null | undefined): string {
  if (year === null || year === undefined || !Number.isFinite(year)) {
    return "an unknown year";
  }
  const y = Math.trunc(year);
  return y < 0 ? `${-y} BCE` : String(y);
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(title|year|location)\}/g, (m, key: string) => {
    const v = values[key];
    return v !== undefined && v.length > 0 ? v : m;
  });
}

/**
 * Builds the positive prompt from the shared template. Missing title /
 * year / location leave the {placeholder} literally in place so the admin
 * sees exactly what will be sent (the textarea stays editable).
 */
export function buildGeneratorPrompt(input: {
  title?: string | null;
  year?: number | null;
  location?: string | null;
}): string {
  return fill(GENERATOR_POSITIVE_TEMPLATE, {
    title: input.title?.trim() ?? "",
    year: formatPromptYear(input.year),
    location: input.location?.trim() ?? "",
  });
}

/** Negative prompt is template-fixed for every generation (no placeholders). */
export function buildGeneratorNegativePrompt(): string {
  return GENERATOR_NEGATIVE_TEMPLATE;
}
