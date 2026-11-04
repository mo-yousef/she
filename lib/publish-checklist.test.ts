import { describe, expect, it } from 'vitest';
import { CHECKLIST_KEYS, publishChecklist, type ChecklistInput } from './publish-checklist';

const complete: ChecklistInput = {
  name: 'Studio',
  category: 'nails',
  city: 'Larnaca',
  address: '1 Main St',
  serviceCount: 1,
  staffCount: 1,
  openDayCount: 5,
  photoCount: 1,
};

describe('publishChecklist', () => {
  it('can publish when everything is present', () => {
    const r = publishChecklist(complete);
    expect(r.canPublish).toBe(true);
    expect(r.items).toHaveLength(8);
  });

  const missing: [string, Partial<ChecklistInput>][] = [
    ['name', { name: '  ' }],
    ['category', { category: '' }],
    ['city', { city: null }],
    ['address', { address: undefined }],
    ['service', { serviceCount: 0 }],
    ['staff', { staffCount: 0 }],
    ['hours', { openDayCount: 0 }],
    ['photo', { photoCount: 0 }],
  ];
  it.each(missing)('blocks publishing when %s is missing, and only that item', (key, patch) => {
    const r = publishChecklist({ ...complete, ...patch });
    expect(r.canPublish).toBe(false);
    expect(r.items.filter((i) => !i.done).map((i) => i.key)).toEqual([key]);
  });

  it('covers every spec item with a fix step', () => {
    expect(publishChecklist(complete).items.map((i) => i.key)).toEqual([...CHECKLIST_KEYS]);
    expect(publishChecklist({ ...complete, photoCount: 0 }).items.find((i) => i.key === 'photo')?.step).toBe('photos');
  });
});
