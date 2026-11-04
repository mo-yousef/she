/**
 * Provider status-webhook logic (task 5.4, requirement 6). The route handlers are thin
 * wrappers: read the RAW body once, call one of these, return `{ status, body }`.
 *
 * Contract for both providers:
 *  - Fail closed: no secret configured, or a signature that does not verify -> 403 and
 *    nothing is read from the payload or written.
 *  - Verification happens on the raw body BEFORE it is parsed; the parsed payload is
 *    then Zod-validated.
 *  - Unknown message ids and ignorable statuses answer 200 (so the provider does not
 *    retry forever) and change nothing.
 *  - No recipient (To/From/email addresses), body, or error text is read into logs or
 *    storage: only the message id and the mapped status are used.
 *  - Signature comparisons are constant-time (Twilio and Svix SDK helpers use
 *    crypto.timingSafeEqual internally).
 */
import { Resend } from 'resend';
import twilio from 'twilio';
import { z } from 'zod';
import { applyProviderStatus } from './log';
import { resendStatus, twilioStatus } from './status';

export interface WebhookResponse {
  status: 200 | 400 | 403;
  body: { ok: boolean };
}

const OK: WebhookResponse = { status: 200, body: { ok: true } };
const FORBIDDEN: WebhookResponse = { status: 403, body: { ok: false } };
const BAD_REQUEST: WebhookResponse = { status: 400, body: { ok: false } };

/**
 * The public URL Twilio called, which is what it signed. `req.url` can be an internal
 * address behind a proxy, so it is built from NEXT_PUBLIC_SITE_URL (must be the exact
 * public origin configured in the Twilio console, including https).
 */
export function twilioWebhookUrl(siteUrl: string | undefined = process.env.NEXT_PUBLIC_SITE_URL): string | null {
  if (!siteUrl) return null;
  return `${siteUrl.replace(/\/+$/, '')}/api/webhooks/twilio`;
}

const twilioSchema = z.object({
  MessageSid: z.string().regex(/^[A-Za-z0-9]{2,64}$/),
  MessageStatus: z.string().min(1).max(32),
});

export async function handleTwilioWebhook(args: {
  rawBody: string;
  signature: string | null;
  url: string | null;
  authToken: string | undefined;
}): Promise<WebhookResponse> {
  const { rawBody, signature, url, authToken } = args;
  if (!authToken || !signature || !url) return FORBIDDEN;

  const params = Object.fromEntries(new URLSearchParams(rawBody));
  let valid = false;
  try {
    valid = twilio.validateRequest(authToken, signature, url, params);
  } catch {
    valid = false;
  }
  if (!valid) return FORBIDDEN;

  const parsed = twilioSchema.safeParse(params);
  if (!parsed.success) return BAD_REQUEST;
  const status = twilioStatus(parsed.data.MessageStatus);
  if (status) await applyProviderStatus(parsed.data.MessageSid, status);
  return OK;
}

const resendSchema = z.object({
  type: z.string().max(64),
  data: z.object({ email_id: z.string().min(1).max(128) }).passthrough(),
});

// The SDK's verify() is a pure Svix HMAC check (5 min timestamp tolerance, constant-time
// compare) and never uses the API key; the constructor only requires it to be non-empty.
const verifier = new Resend('unused-for-webhook-verification');

export async function handleResendWebhook(args: {
  rawBody: string;
  headers: { id: string | null; timestamp: string | null; signature: string | null };
  secret: string | undefined;
}): Promise<WebhookResponse> {
  const { rawBody, headers, secret } = args;
  if (!secret || !headers.id || !headers.timestamp || !headers.signature) return FORBIDDEN;

  try {
    verifier.webhooks.verify({
      payload: rawBody,
      headers: { id: headers.id, timestamp: headers.timestamp, signature: headers.signature },
      webhookSecret: secret,
    });
  } catch {
    return FORBIDDEN;
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return BAD_REQUEST;
  }
  const parsed = resendSchema.safeParse(json);
  if (!parsed.success) return BAD_REQUEST;
  const status = resendStatus(parsed.data.type);
  if (status) await applyProviderStatus(parsed.data.data.email_id, status);
  return OK;
}
