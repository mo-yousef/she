import { NextResponse } from 'next/server';
import { handleTwilioWebhook, twilioWebhookUrl } from '@/lib/notify/webhooks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Twilio message status callback (form-encoded). See lib/notify/webhooks.ts. */
export async function POST(req: Request) {
  const rawBody = await req.text();
  const res = await handleTwilioWebhook({
    rawBody,
    signature: req.headers.get('x-twilio-signature'),
    url: twilioWebhookUrl(),
    authToken: process.env.TWILIO_AUTH_TOKEN,
  });
  return NextResponse.json(res.body, { status: res.status });
}
