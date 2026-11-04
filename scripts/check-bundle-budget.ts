/**
 * Performance budget (task 8.2, req 10). Reads the `.next` app build manifest and
 * fails if the gzipped First Load JS of a key public route exceeds its budget.
 * Run after `pnpm build`: `pnpm check:budget`. Pass `--report` to only print sizes.
 */
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const KB = 1024;
// Budgets in gzipped KB, set a little above the measured post-fix values (docs/performance.md).
const BUDGETS: Record<string, number> = {
  '/[locale]/page': 140,
  '/[locale]/search/page': 140,
  '/[locale]/b/[slug]/page': 145,
  '/[locale]/b/[slug]/book/page': 155,
};

const root = join(process.cwd(), '.next');
const manifest = JSON.parse(readFileSync(join(root, 'app-build-manifest.json'), 'utf8')) as {
  pages: Record<string, string[]>;
};
const report = process.argv.includes('--report');
const cache = new Map<string, number>();
const gz = (f: string) => {
  if (!cache.has(f)) cache.set(f, gzipSync(readFileSync(join(root, f))).length);
  return cache.get(f)!;
};

let failed = false;
for (const [route, budget] of Object.entries(BUDGETS)) {
  const files = manifest.pages[route];
  if (!files) {
    console.error(`✗ ${route}: not in app-build-manifest (run pnpm build first)`);
    failed = true;
    continue;
  }
  const total = [...new Set(files.filter((f) => f.endsWith('.js')))].reduce((s, f) => s + gz(f), 0);
  const kb = total / KB;
  const ok = kb <= budget;
  if (!ok) failed = true;
  console.log(`${ok ? '✓' : '✗'} ${route}: ${kb.toFixed(1)} KB gzip (budget ${budget} KB)`);
  if (process.argv.includes('--files')) {
    for (const f of files.filter((x) => x.endsWith('.js'))) console.log(`    ${(gz(f) / KB).toFixed(1)} KB ${f}`);
  }
}
if (failed && !report) process.exit(1);
