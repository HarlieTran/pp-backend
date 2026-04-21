import { z } from "zod";

/* ──────────────────────────────────────────────
   Zod schemas for pantry request bodies
   ────────────────────────────────────────────── */

export const addPantryItemSchema = z.object({
  rawName: z.string().min(1).max(200),
  quantity: z.number().positive(),
  unit: z.string().min(1).max(50),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().max(500).optional(),
});

export const updatePantryItemSchema = z.object({
  quantity: z.number().positive().optional(),
  unit: z.string().min(1).max(50).optional(),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export const uploadUrlSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
});

export const parseImageSchema = z.object({
  imageKey: z.string().min(1),
});

export const bulkAddSchema = z.object({
  items: z
    .array(
      z.object({
        rawName: z.string().min(1).max(200),
        quantity: z.number().positive(),
        unit: z.string().min(1).max(50),
        expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        notes: z.string().max(500).optional(),
      }),
    )
    .max(50),
});

/* ──────────────────────────────────────────────
   Expiry status types
   ────────────────────────────────────────────── */

export type ExpiryStatus = "expired" | "expiring_soon" | "fresh" | "no_date";

export interface ParsedIngredient {
  name: string;
  quantity: string;
  unit: string;
  category: string;
}

/* ──────────────────────────────────────────────
   Expiry helpers
   ────────────────────────────────────────────── */

export function computeExpiryStatus(expiryDate: string | null): { status: ExpiryStatus; daysUntilExpiry: number | null } {
  if (!expiryDate) return { status: "no_date", daysUntilExpiry: null };

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate + "T00:00:00");
  const diffMs = expiry.getTime() - now.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (days < 0) return { status: "expired", daysUntilExpiry: days };
  if (days <= 3) return { status: "expiring_soon", daysUntilExpiry: days };
  return { status: "fresh", daysUntilExpiry: days };
}

const STATUS_ORDER: Record<ExpiryStatus, number> = {
  expired: 0,
  expiring_soon: 1,
  fresh: 2,
  no_date: 3,
};

export function sortByExpiryUrgency<T extends { expiryDate: string | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const sa = computeExpiryStatus(a.expiryDate);
    const sb = computeExpiryStatus(b.expiryDate);

    // Primary: status order
    const orderDiff = STATUS_ORDER[sa.status] - STATUS_ORDER[sb.status];
    if (orderDiff !== 0) return orderDiff;

    // Secondary: within same status, earlier expiry first
    if (a.expiryDate && b.expiryDate) return a.expiryDate.localeCompare(b.expiryDate);
    if (a.expiryDate) return -1;
    if (b.expiryDate) return 1;
    return 0;
  });
}
