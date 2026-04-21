import { prisma } from "../../../common/db/prisma.js";
import type { AuthClaims } from "../../../common/auth/jwt.js";

/* ──────────────────────────────────────────────
   bootstrapUser — upsert UserProfile from Cognito claims
   ────────────────────────────────────────────── */

export async function bootstrapUser(claims: AuthClaims) {
  const profile = await prisma.userProfile.upsert({
    where: {
      authProvider_authSubject: {
        authProvider: "cognito",
        authSubject: claims.sub,
      },
    },
    update: {
      email: claims.email,
      firstName: claims.given_name || undefined,
      lastName: claims.family_name || undefined,
    },
    create: {
      authProvider: "cognito",
      authSubject: claims.sub,
      email: claims.email,
      firstName: claims.given_name || null,
      lastName: claims.family_name || null,
      displayName: claims.given_name || claims.email.split("@")[0],
    },
  });

  return profile;
}

/* ──────────────────────────────────────────────
   getProfile — returns profile + preference profile + answers
   ────────────────────────────────────────────── */

export async function getProfile(userId: string) {
  const profile = await prisma.userProfile.findUnique({
    where: { id: userId },
    include: {
      preferenceProfile: true,
      answers: {
        include: {
          question: true,
          option: true,
        },
      },
    },
  });

  if (!profile) throw new Error("Not found");
  return profile;
}

/* ──────────────────────────────────────────────
   updateProfile — patches displayName, dietType, allergies, etc.
   ────────────────────────────────────────────── */

export async function updateProfile(
  userId: string,
  data: {
    displayName?: string;
    likes?: string;
    dietType?: string[];
    allergies?: string[];
    disliked?: string;
    notes?: string;
  },
) {
  // Update the UserProfile fields
  const profile = await prisma.userProfile.update({
    where: { id: userId },
    data: {
      displayName: data.displayName,
    },
  });

  // Update or create the UserPreferenceProfile
  if (data.dietType || data.allergies || data.likes || data.disliked || data.notes) {
    await prisma.userPreferenceProfile.upsert({
      where: { userId },
      update: {
        likes: data.likes ? { csv: data.likes } : undefined,
        dislikes: data.disliked ? { csv: data.disliked } : undefined,
        dietSignals: {
          dietType: data.dietType ?? [],
          allergies: data.allergies ?? [],
          notes: data.notes ?? "",
        },
        rawModelOutput: {},
        confidence: {},
      },
      create: {
        userId,
        likes: data.likes ? { csv: data.likes } : {},
        dislikes: data.disliked ? { csv: data.disliked } : {},
        dietSignals: {
          dietType: data.dietType ?? [],
          allergies: data.allergies ?? [],
          notes: data.notes ?? "",
        },
        rawModelOutput: {},
        confidence: {},
      },
    });
  }

  return profile;
}

/* ──────────────────────────────────────────────
   findUserBySubject — lookup by auth subject
   ────────────────────────────────────────────── */

export async function findUserBySubject(sub: string) {
  return prisma.userProfile.findFirst({
    where: { authProvider: "cognito", authSubject: sub },
  });
}
