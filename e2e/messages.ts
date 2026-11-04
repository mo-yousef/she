/** The real translation files, so specs assert the exact translated labels (never guessed). */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Messages = typeof import('../messages/en.json');
const load = (l: string) => JSON.parse(readFileSync(join(process.cwd(), 'messages', `${l}.json`), 'utf8')) as Messages;

export const en = load('en');
export const messages = { en, el: load('el'), ru: load('ru') } as const;
