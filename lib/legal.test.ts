import { describe, expect, it } from 'vitest';
import en from '../messages/en.json';
import el from '../messages/el.json';
import ru from '../messages/ru.json';
import { LEGAL_PAGES } from './legal';

describe('legal pages', () => {
  it.each(LEGAL_PAGES)('%s has the same section and paragraph counts in en/el/ru', (page) => {
    const shape = (m: typeof en) =>
      m.legal.pages[page].sections.map((s) => s.paragraphs.length);
    expect(shape(el as typeof en)).toEqual(shape(en));
    expect(shape(ru as typeof en)).toEqual(shape(en));
  });
});
