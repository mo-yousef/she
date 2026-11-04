import { NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cron-auth';
import { runNotificationCron } from '@/lib/notification-cron';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Vercel Cron (GET). Runs 24h/2h reminders and review requests in one pass. */
export async function GET(req: Request) {
  if (!isCronAuthorized(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return NextResponse.json(await runNotificationCron());
}
