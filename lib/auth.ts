import NextAuth from 'next-auth';
import type { NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';
import Nodemailer from 'next-auth/providers/nodemailer';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { db } from './db';

/**
 * Auth.js v5 (requirements §7). Email magic link + Google, roles on the session.
 * The email provider uses Nodemailer transport; in production point it at
 * Resend's SMTP. Google is enabled only when credentials are present so local
 * dev works without them.
 */
// shortcut: local dev without an email provider prints the magic link to the server
// console instead of sending it (development only; never in production or test builds).
// Revisit never: it is gated on NODE_ENV === 'development' && no RESEND_API_KEY.
const devConsoleMagicLink = process.env.NODE_ENV === 'development' && !process.env.RESEND_API_KEY;

const providers: NextAuthConfig['providers'] = [
  Nodemailer({
    server: {
      host: process.env.EMAIL_SERVER_HOST ?? 'smtp.resend.com',
      port: Number(process.env.EMAIL_SERVER_PORT ?? 465),
      auth: {
        user: process.env.EMAIL_SERVER_USER ?? 'resend',
        pass: process.env.RESEND_API_KEY ?? '',
      },
    },
    from: process.env.EMAIL_FROM ?? 'she.cy <bookings@she.cy>',
    ...(devConsoleMagicLink
      ? {
        // Only the link is printed (no email address: no PII in logs).
        sendVerificationRequest: async ({ url }: { url: string }) => {
          console.info(`[dev] Magic sign-in link: ${url}`);
        },
      }
      : {}),
  }),
];

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  );
}

export const authConfig: NextAuthConfig = {
  adapter: PrismaAdapter(db),
  session: { strategy: 'database' },
  providers,
  // Auth.js pages are static paths, so they point at the default locale; the account page
  // forwards to the locale found in `callbackUrl` (see app/[locale]/account/page.tsx).
  pages: {
    signIn: '/en/account',
    error: '/en/account',
    verifyRequest: '/en/account?sent=1',
  },
  callbacks: {
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        // role/locale are columns on User; expose them on the session.
        session.user.role = (user as { role?: string }).role ?? 'CUSTOMER';
        session.user.locale = (user as { locale?: string }).locale ?? 'en';
      }
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
