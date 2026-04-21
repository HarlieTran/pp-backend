import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

/* ──────────────────────────────────────────────
   Types
   ────────────────────────────────────────────── */

export interface AuthClaims {
  sub: string;
  email: string;
  given_name: string;
  family_name: string;
}

/* ──────────────────────────────────────────────
   JWKS singleton — fetched once, cached in memory
   ────────────────────────────────────────────── */

const COGNITO_REGION = process.env.COGNITO_REGION ?? "us-east-2";
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID ?? "";
const COGNITO_APP_CLIENT_ID = process.env.COGNITO_APP_CLIENT_ID ?? "";

const issuer = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_USER_POOL_ID}`;
const jwksUrl = new URL(`${issuer}/.well-known/jwks.json`);
const jwks = createRemoteJWKSet(jwksUrl);

/* ──────────────────────────────────────────────
   verifyCognitoToken
   ────────────────────────────────────────────── */

export async function verifyCognitoToken(token: string): Promise<AuthClaims> {
  const { payload } = await jwtVerify(token, jwks, {
    issuer,
    audience: COGNITO_APP_CLIENT_ID,
  });

  // Cognito id_tokens set token_use = "id"
  if ((payload as JWTPayload & { token_use?: string }).token_use !== "id") {
    throw new Error("Token is not an id_token");
  }

  return {
    sub: payload.sub ?? "",
    email: (payload as Record<string, unknown>).email as string ?? "",
    given_name: (payload as Record<string, unknown>).given_name as string ?? "",
    family_name: (payload as Record<string, unknown>).family_name as string ?? "",
  };
}
