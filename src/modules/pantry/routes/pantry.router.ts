import { Router } from "express";
import { requireAuth, type AuthenticatedRequest } from "../../auth/index.js";
import { ok, created, handleError, parseBody, badRequest, forbidden } from "../../../common/routing/helpers.js";
import { findUserBySubject } from "../../users/services/profile.service.js";
import {
  getPantryItems,
  addPantryItem,
  updatePantryItem,
  deletePantryItem,
  getPresignedUploadUrl,
  parseImageForIngredients,
  bulkAddPantryItems,
} from "../services/pantry.service.js";
import {
  addPantryItemSchema,
  updatePantryItemSchema,
  uploadUrlSchema,
  parseImageSchema,
  bulkAddSchema,
} from "../model/pantry.types.js";

export const pantryRouter = Router();

/* ── GET /me/pantry ──────────────────────────── */

pantryRouter.get("/me/pantry", requireAuth, async (req, res) => {
  try {
    const { auth } = req as AuthenticatedRequest;
    const user = await findUserBySubject(auth.sub);
    if (!user) { badRequest(res, "User not found"); return; }
    const items = await getPantryItems(user.id);
    ok(res, { items });
  } catch (err) {
    handleError(res, err);
  }
});

/* ── POST /me/pantry ─────────────────────────── */

pantryRouter.post("/me/pantry", requireAuth, async (req, res) => {
  try {
    const { auth } = req as AuthenticatedRequest;
    const user = await findUserBySubject(auth.sub);
    if (!user) { badRequest(res, "User not found"); return; }
    const data = parseBody(req.body, addPantryItemSchema);
    const item = await addPantryItem(user.id, data);
    created(res, item);
  } catch (err) {
    handleError(res, err);
  }
});

/* ── PATCH /me/pantry/:id ────────────────────── */

pantryRouter.patch("/me/pantry/:id", requireAuth, async (req, res) => {
  try {
    const { auth } = req as AuthenticatedRequest;
    const user = await findUserBySubject(auth.sub);
    if (!user) { badRequest(res, "User not found"); return; }
    const data = parseBody(req.body, updatePantryItemSchema);
    const item = await updatePantryItem(user.id, req.params.id, data);
    ok(res, item);
  } catch (err) {
    handleError(res, err);
  }
});

/* ── DELETE /me/pantry/:id ───────────────────── */

pantryRouter.delete("/me/pantry/:id", requireAuth, async (req, res) => {
  try {
    const { auth } = req as AuthenticatedRequest;
    const user = await findUserBySubject(auth.sub);
    if (!user) { badRequest(res, "User not found"); return; }
    const result = await deletePantryItem(user.id, req.params.id);
    ok(res, result);
  } catch (err) {
    handleError(res, err);
  }
});

/* ── POST /me/pantry/upload-url ──────────────── */

pantryRouter.post("/me/pantry/upload-url", requireAuth, async (req, res) => {
  try {
    const { auth } = req as AuthenticatedRequest;
    const user = await findUserBySubject(auth.sub);
    if (!user) { badRequest(res, "User not found"); return; }
    const { filename, contentType } = parseBody(req.body, uploadUrlSchema);
    const result = await getPresignedUploadUrl(user.id, filename, contentType);
    ok(res, result);
  } catch (err) {
    handleError(res, err);
  }
});

/* ── POST /me/pantry/parse-image ─────────────── */

pantryRouter.post("/me/pantry/parse-image", requireAuth, async (req, res) => {
  try {
    const { auth } = req as AuthenticatedRequest;
    const user = await findUserBySubject(auth.sub);
    if (!user) { badRequest(res, "User not found"); return; }
    const { imageKey } = parseBody(req.body, parseImageSchema);

    // Validate that the key belongs to this user
    if (!imageKey.startsWith(`pantry-uploads/${user.id}/`)) {
      forbidden(res);
      return;
    }

    const items = await parseImageForIngredients(user.id, imageKey);
    ok(res, { items });
  } catch (err) {
    handleError(res, err);
  }
});

/* ── POST /me/pantry/items/bulk ──────────────── */

pantryRouter.post("/me/pantry/items/bulk", requireAuth, async (req, res) => {
  try {
    const { auth } = req as AuthenticatedRequest;
    const user = await findUserBySubject(auth.sub);
    if (!user) { badRequest(res, "User not found"); return; }
    const { items } = parseBody(req.body, bulkAddSchema);
    const result = await bulkAddPantryItems(user.id, items);
    created(res, { items: result });
  } catch (err) {
    handleError(res, err);
  }
});
