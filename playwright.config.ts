import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config (task 4.7, req 4.1 / AC4). Chromium only to keep the suite light.
 *
 * Safety: the suite creates and deletes its own fixtures, so it refuses to run unless
 * E2E_DATABASE_URL points at a database whose name contains "test" (e.g. she_cy_test).
 * That URL is injected as DATABASE_URL for both the test workers and the Next server,
 * so the dev database is never touched.
 *
 * The server runs `next dev` (NODE_ENV=development) on purpose: in production mode
 * Turnstile fails closed without a Cloudflare secret (lib/turnstile.ts), so a guest
 * booking could not complete offline. In dev with no TURNSTILE_SECRET_KEY the guest
 * check is skipped by design. Known quirk: Next 15 dev mode intermittently throws
 * "frame.join is not a function" (React dev-only buildFakeCallStack) on a page load;
 * booking-ui.spec.ts reloads once during SETUP if it sees that error page.
 */
const dbUrl = process.env.E2E_DATABASE_URL ?? '';
const dbName = (() => {
  try {
    return new URL(dbUrl).pathname.slice(1);
  } catch {
    return '';
  }
})();
if (!/test/i.test(dbName)) {
  throw new Error(
    'E2E_DATABASE_URL must point at a scratch database whose name contains "test" ' +
    '(e.g. postgresql://user@localhost:5432/she_cy_test). See README "End-to-end tests".',
  );
}

process.env.DATABASE_URL = dbUrl;
process.env.DIRECT_URL = dbUrl;
process.env.MANAGE_TOKEN_SECRET ??= 'e2e-manage-token-secret-not-for-production';

const PORT = 3100;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm exec next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/en`,
    // Never attach to a server we did not start: it could point at another database.
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: dbUrl,
      DIRECT_URL: dbUrl,
      MANAGE_TOKEN_SECRET: process.env.MANAGE_TOKEN_SECRET,
      // Supabase Auth: the server client validates sessions against this project.
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
      NEXT_PUBLIC_SITE_URL: `http://localhost:${PORT}`,
      TURNSTILE_SECRET_KEY: '',
      TURNSTILE_SITE_KEY: '',
    },
  },
});
