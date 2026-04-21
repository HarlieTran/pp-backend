import { verifyCognitoToken, type AuthClaims } from "../../../common/auth/jwt.js";

/**
 * Standalone auth wrapper (non-Express) — useful inside Lambda or plain handlers.
 * Extracts Bearer token, verifies it, and passes `AuthClaims` to `handler`.
 */
export async function withAuth<T>(
  authHeader: string | undefined,
  handler: (claims: AuthClaims) => Promise<T>,
): Promise<{ statusCode: number; body: unknown } | T> {
  if (!authHeader) {
    return { statusCode: 401, body: { error: "Missing Authorization header" } };
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return { statusCode: 401, body: { error: "Malformed Authorization header" } };
  }

  try {
    const claims = await verifyCognitoToken(match[1]);
    return handler(claims);
  } catch {
    return { statusCode: 401, body: { error: "Invalid or expired token" } };
  }
}
