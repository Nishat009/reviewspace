import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { db } from "@/lib/db";
import { burnPasswordCheck, verifyPassword } from "@/lib/auth/password";
import { signInSchema } from "@/lib/validation/auth";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
    /** Mirrors JWT.sv so the data access layer can compare it with the DB. */
    sessionVersion: number;
  }
}

const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

/** Google sign-in is offered only when its credentials are configured. */
export const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE, updateAge: 24 * 60 * 60 },
  pages: { signIn: "/sign-in", error: "/sign-in" },
  trustHost: true,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = signInSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        const user = await db.user.findUnique({
          where: { email },
          select: { id: true, name: true, email: true, image: true, passwordHash: true, sessionVersion: true },
        });

        if (!user?.passwordHash) {
          await burnPasswordCheck(password);
          return null;
        }
        if (!(await verifyPassword(user.passwordHash, password))) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
    ...(googleEnabled ? [Google({ clientId: process.env.AUTH_GOOGLE_ID, clientSecret: process.env.AUTH_GOOGLE_SECRET })] : []),
  ],
  callbacks: {
    /**
     * Google: only verified Google emails are accepted. An existing account
     * with the same (verified) email is signed in; otherwise one is created.
     * There is no adapter: our own users table stays the single source.
     */
    async signIn({ account, profile }) {
      if (account?.provider !== "google") return true;
      const email = typeof profile?.email === "string" ? profile.email.trim().toLowerCase() : null;
      if (!email || profile?.email_verified !== true) return false;

      const existing = await db.user.findUnique({ where: { email }, select: { id: true, emailVerified: true, guestShareLinkId: true } });
      if (existing?.guestShareLinkId) return false;
      if (existing) {
        if (!existing.emailVerified) await db.user.update({ where: { id: existing.id }, data: { emailVerified: new Date() } });
      } else {
        await db.user.create({
          data: { email, name: (typeof profile.name === "string" && profile.name.trim()) || email.split("@")[0]!, emailVerified: new Date() },
        });
      }
      return true;
    },
    // JWT claims: uid = user id, sv = User.sessionVersion at sign-in (a
    // mismatch with the DB means the session was revoked).
    async jwt({ token, user, account, profile }) {
      if (account?.provider === "google" && typeof profile?.email === "string") {
        const record = await db.user.findUnique({
          where: { email: profile.email.trim().toLowerCase() },
          select: { id: true, sessionVersion: true },
        });
        if (record) {
          token.uid = record.id;
          token.sv = record.sessionVersion;
        }
        return token;
      }
      if (user) {
        token.uid = user.id;
        token.sv = (user as { sessionVersion?: number }).sessionVersion ?? 0;
      }
      return token;
    },
    session({ session, token }) {
      if (typeof token.uid === "string") session.user.id = token.uid;
      session.sessionVersion = typeof token.sv === "number" ? token.sv : -1;
      return session;
    },
  },
});
