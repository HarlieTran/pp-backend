import { prisma } from "../../../common/db/prisma.js";

/* ──────────────────────────────────────────────
   getNotesForUser — returns all planner notes
   ────────────────────────────────────────────── */

export async function getNotesForUser(userId: string) {
  const notes = await prisma.plannerNote.findMany({
    where: { userId },
    orderBy: { date: "asc" },
  });

  return notes.map((n) => ({
    date: n.date,
    text: n.text,
  }));
}

/* ──────────────────────────────────────────────
   upsertNote — create or update a note for a date
   ────────────────────────────────────────────── */

export async function upsertNote(userId: string, date: string, text: string) {
  return await prisma.plannerNote.upsert({
    where: { userId_date: { userId, date } },
    update: { text },
    create: { userId, date, text },
  });
}

/* ──────────────────────────────────────────────
   deleteNote — remove a note by date
   ────────────────────────────────────────────── */

export async function deleteNote(userId: string, date: string) {
  const existing = await prisma.plannerNote.findUnique({
    where: { userId_date: { userId, date } },
  });

  if (existing) {
    await prisma.plannerNote.delete({
      where: { id: existing.id },
    });
  }
}
