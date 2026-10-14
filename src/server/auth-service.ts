import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { actionEmail, appUrl, sendEmail } from "@/lib/email";
import { hashPassword } from "@/lib/auth/password";
import { generateToken, hashToken, TOKEN_TTL } from "@/lib/auth/tokens";
import type { SignUpInput } from "@/lib/validation/auth";

export async function signUp(input: SignUpInput) {
  const passwordHash = await hashPassword(input.password);
  try {
    const user = await db.user.create({
      data: { name: input.name, email: input.email, passwordHash },
      select: { id: true, email: true, name: true },
    });
    await sendVerificationEmail(user);
    return user;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError("CONFLICT", "An account with this email already exists.");
    }
    throw error;
  }
}

async function issueToken(userId: string, purpose: "EMAIL_VERIFICATION" | "PASSWORD_RESET") {
  const token = generateToken();
  await db.$transaction([
    // Only the newest link of each kind stays valid.
    db.authToken.updateMany({
      where: { userId, purpose, usedAt: null },
      data: { usedAt: new Date() },
    }),
    db.authToken.create({
      data: {
        userId,
        purpose,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + TOKEN_TTL[purpose]),
      },
    }),
  ]);
  return token;
}

export async function sendVerificationEmail(user: { id: string; email: string; name: string }) {
  const token = await issueToken(user.id, "EMAIL_VERIFICATION");
  const url = appUrl(`/verify-email?token=${token}`);
  await sendEmail({
    to: user.email,
    subject: "Verify your ReviewSpace email",
    ...actionEmail({
      heading: `Welcome, ${user.name}`,
      body: "Confirm your email address to accept invitations and receive review notifications.",
      actionLabel: "Verify email",
      url,
      footer: "This link expires in 24 hours. If you didn't create an account, ignore this email.",
    }),
  });
}

/**
 * Consumes a single-use token. The conditional `updateMany` makes concurrent
 * redemptions safe: only one request can flip `usedAt` from null.
 */
async function consumeToken(token: string, purpose: "EMAIL_VERIFICATION" | "PASSWORD_RESET") {
  const tokenHash = hashToken(token);
  const record = await db.authToken.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, purpose: true, usedAt: true, expiresAt: true },
  });
  if (!record || record.purpose !== purpose || record.usedAt || record.expiresAt <= new Date()) {
    return null;
  }
  const { count } = await db.authToken.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  return count === 1 ? record.userId : null;
}

export async function verifyEmail(token: string) {
  const userId = await consumeToken(token, "EMAIL_VERIFICATION");
  if (!userId) throw new AppError("INVALID", "This verification link is invalid or has expired.");
  await db.user.update({ where: { id: userId }, data: { emailVerified: new Date() } });
}

/** Always resolves the same way, whether or not the account exists. */
export async function requestPasswordReset(email: string) {
  const user = await db.user.findUnique({ where: { email }, select: { id: true, email: true } });
  if (!user) return;

  const token = await issueToken(user.id, "PASSWORD_RESET");
  await sendEmail({
    to: user.email,
    subject: "Reset your ReviewSpace password",
    ...actionEmail({
      heading: "Reset your password",
      body: "Someone asked to reset the password for this account. Use the button below to choose a new one.",
      actionLabel: "Reset password",
      url: appUrl(`/reset-password?token=${token}`),
      footer: "This link expires in 30 minutes. If you didn't ask for this, you can ignore this email.",
    }),
  });
}

/**
 * Sets a new password and bumps `sessionVersion`, which signs the account out
 * on every device. Completing a reset also proves inbox ownership.
 */
export async function resetPassword(token: string, password: string) {
  const userId = await consumeToken(token, "PASSWORD_RESET");
  if (!userId) throw new AppError("INVALID", "This reset link is invalid or has expired.");

  const passwordHash = await hashPassword(password);
  const user = await db.user.update({
    where: { id: userId },
    data: { passwordHash, sessionVersion: { increment: 1 } },
    select: { emailVerified: true },
  });
  if (!user.emailVerified) {
    await db.user.update({ where: { id: userId }, data: { emailVerified: new Date() } });
  }
}
