import { Resend } from 'resend';
import type { EmailMessage, EmailProvider, NotifyErrorCode, SendResult } from './types';

/** The slice of the Resend SDK we use; lets tests inject a fake. */
export interface ResendLike {
  emails: {
    send(payload: {
      from: string;
      to: string;
      subject: string;
      html: string;
      text: string;
    }): Promise<{
      data: { id: string } | null;
      error: { name?: string; statusCode?: number | null } | null;
    }>;
  };
}

export function mapResendError(error: { name?: string; statusCode?: number | null }): NotifyErrorCode {
  if (error.statusCode === 429 || error.name === 'rate_limit_exceeded') return 'RATE_LIMITED';
  // shortcut: Resend's validation_error covers any bad field, not just the address; we
  // treat it as an unusable recipient because `to` is the only field callers don't control.
  if (error.name === 'validation_error') return 'INVALID_RECIPIENT';
  return 'PROVIDER_ERROR';
}

export function createResendEmail(client: ResendLike, from: string): EmailProvider {
  return {
    async sendEmail(m: EmailMessage): Promise<SendResult> {
      try {
        const { data, error } = await client.emails.send({
          from,
          to: m.to,
          subject: m.subject,
          html: m.html,
          text: m.text,
        });
        if (error || !data) {
          return { ok: false, channel: 'EMAIL', code: error ? mapResendError(error) : 'PROVIDER_ERROR' };
        }
        return { ok: true, channel: 'EMAIL', providerId: data.id };
      } catch {
        // Network/SDK failure. The error text may echo the recipient, so it is dropped.
        return { ok: false, channel: 'EMAIL', code: 'PROVIDER_ERROR' };
      }
    },
  };
}

export function resendFromEnv(env: { RESEND_API_KEY?: string; EMAIL_FROM?: string }): EmailProvider {
  return createResendEmail(new Resend(env.RESEND_API_KEY), env.EMAIL_FROM ?? 'she.cy <bookings@she.cy>');
}
