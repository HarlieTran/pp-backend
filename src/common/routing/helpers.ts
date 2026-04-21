import { type Response } from "express";
import { ZodError, type ZodType } from "zod";

/* ──────────────────────────────────────────────
   Success helpers
   ────────────────────────────────────────────── */

export function ok(res: Response, body: unknown) {
  res.status(200).json(body);
}

export function created(res: Response, body: unknown) {
  res.status(201).json(body);
}

/* ──────────────────────────────────────────────
   Error helpers
   ────────────────────────────────────────────── */

export function badRequest(res: Response, msg: string) {
  res.status(400).json({ error: msg });
}

export function unauthorized(res: Response) {
  res.status(401).json({ error: "Unauthorized" });
}

export function forbidden(res: Response) {
  res.status(403).json({ error: "Forbidden" });
}

export function notFound(res: Response) {
  res.status(404).json({ error: "Not found" });
}

export function serverError(res: Response, err?: any) {
  res.status(500).json({ error: err instanceof Error ? err.message : String(err) || "Internal server error" });
}

/* ──────────────────────────────────────────────
   handleError — maps known error shapes to status codes
   ────────────────────────────────────────────── */

export function handleError(res: Response, err: unknown) {
  if (err instanceof ZodError) {
    res.status(400).json({ error: err.errors });
    return;
  }

  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes("not found")) {
      notFound(res);
      return;
    }
  }

  console.error("[handleError]", err);
  serverError(res, err);
}

/* ──────────────────────────────────────────────
   parseBody — validate raw JSON string against Zod schema
   ────────────────────────────────────────────── */

export function parseBody<T>(body: unknown, schema: ZodType<T>): T {
  return schema.parse(body);
}
