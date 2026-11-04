/**
 * Fails (exit 1) if any locale is missing a key present in the default locale,
 * or has an extra key. Keeps en/el/ru in lockstep (requirement §8, CI gate).
 * Run: pnpm check:messages
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const messagesDir = join(here, '..', 'messages');
const locales = ['en', 'el', 'ru'];
const DEFAULT = 'en';

function flatten(obj: unknown, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object') return [prefix];
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    out.push(...flatten(v, key));
  }
  return out;
}

function load(locale: string): Set<string> {
  const raw = readFileSync(join(messagesDir, `${locale}.json`), 'utf8');
  return new Set(flatten(JSON.parse(raw)));
}

const base = load(DEFAULT);
let failed = false;

for (const locale of locales) {
  if (locale === DEFAULT) continue;
  const keys = load(locale);
  const missing = [...base].filter((k) => !keys.has(k));
  const extra = [...keys].filter((k) => !base.has(k));
  if (missing.length || extra.length) {
    failed = true;
    console.error(`\nLocale "${locale}" is out of sync with "${DEFAULT}":`);
    if (missing.length) console.error(`  Missing keys:\n    ${missing.join('\n    ')}`);
    if (extra.length) console.error(`  Extra keys:\n    ${extra.join('\n    ')}`);
  }
}

if (failed) {
  console.error('\nTranslation check failed. Add the missing keys to every locale.');
  process.exit(1);
}
console.log(`Translations in sync across: ${locales.join(', ')}`);
