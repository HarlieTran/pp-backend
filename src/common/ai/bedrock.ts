/**
 * Strip markdown code fences from AI model output before JSON.parse.
 * Handles ```json ... ``` and bare ``` ... ``` patterns.
 */
export function stripCodeFence(raw: string): string {
  let cleaned = raw;
  const match = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (match) {
    cleaned = match[1];
  }
  return cleaned.trim();
}
