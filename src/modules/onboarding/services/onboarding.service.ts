import { prisma } from "../../../common/db/prisma.js";

/* ──────────────────────────────────────────────
   getQuestions — returns active questions with options
   ────────────────────────────────────────────── */

export async function getQuestions() {
  return prisma.question.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    include: {
      options: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
}

/* ──────────────────────────────────────────────
   saveAnswers — upserts user answers for each question
   ────────────────────────────────────────────── */

export async function saveAnswers(
  userId: string,
  answers: Array<{
    questionKey: string;
    optionValues?: string[];
    answerText?: string;
  }>,
) {
  // Delete existing answers for this user first (idempotent)
  await prisma.userAnswer.deleteMany({ where: { userId } });

  for (const ans of answers) {
    const question = await prisma.question.findUnique({
      where: { key: ans.questionKey },
      include: { options: true },
    });

    if (!question) continue;

    if (ans.optionValues && ans.optionValues.length > 0) {
      // Multi/single choice — create one UserAnswer per selected option
      for (const optValue of ans.optionValues) {
        const option = question.options.find((o) => o.value === optValue);
        await prisma.userAnswer.create({
          data: {
            userId,
            questionId: question.id,
            optionId: option?.id ?? null,
            answerText: ans.answerText?.slice(0, 500) ?? null,
          },
        });
      }
    } else {
      // Free text — no option selected
      await prisma.userAnswer.create({
        data: {
          userId,
          questionId: question.id,
          optionId: null,
          answerText: ans.answerText?.slice(0, 500) ?? null,
        },
      });
    }
  }

  return { ok: true };
}

/* ──────────────────────────────────────────────
   completeOnboarding — sets onboardingCompleted = true
   ────────────────────────────────────────────── */

export async function completeOnboarding(userId: string) {
  await prisma.userProfile.update({
    where: { id: userId },
    data: { onboardingCompleted: true },
  });

  return { ok: true };
}
