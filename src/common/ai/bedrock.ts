/**
 * Strip markdown code fences from AI model output before JSON.parse.
 * Handles ```json ... ``` and bare ``` ... ``` patterns.
 */
export function stripCodeFence(raw: string): string {
  return raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}
