import { NextResponse } from 'next/server';
import { handleResendWebhook } from '@/lib/notify/webhooks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Resend delivery events (Svix-signed JSON). See lib/notify/webhooks.ts. */
export async function POST(req: Request) {
  const rawBody = await req.text();
  const res = await handleResendWebhook({
    rawBody,
    headers: {
      id: req.headers.get('svix-id'),
      timestamp: req.headers.get('svix-timestamp'),
      signature: req.headers.get('svix-signature'),
    },
    secret: process.env.RESEND_WEBHOOK_SECRET,
  });
  return NextResponse.json(res.body, { status: res.status });
}
