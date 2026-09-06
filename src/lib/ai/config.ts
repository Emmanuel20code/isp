/**
 * Central AI Configuration for WiFiBilling
 * Primary AI Model: ox-alpha
 */

export const PRIMARY_MODEL = "ox-alpha";
export const FALLBACK_MODEL = "openai/gpt-4o-mini";

export function getOpenRouterApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error("OPENROUTER_API_KEY environment variable is missing.");
  }
  return key;
}

export function getPreferredModel(): string {
  return process.env.OPENROUTER_MODEL || PRIMARY_MODEL;
}
