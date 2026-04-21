import { type Request, type Response, type NextFunction } from "express";
import { verifyCognitoToken, type AuthClaims } from "../../../common/auth/jwt.js";

/**
 * Express-compatible interface that adds `auth` claims to the request.
 */
export interface AuthenticatedRequest extends Request {
  auth: AuthClaims;
}

/**
 * Express middleware — verifies the Cognito id_token from the Authorization header.
 * On success, sets `req.auth` with decoded claims. On failure, returns 401.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    res.status(401).json({ error: "Missing or malformed Authorization header" });
    return;
  }

  try {
    const claims = await verifyCognitoToken(match[1]);
    (req as AuthenticatedRequest).auth = claims;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
