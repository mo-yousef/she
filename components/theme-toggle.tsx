'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';

type Theme = 'light' | 'dark' | 'system';

export function ThemeToggle() {
  const t = useTranslations('theme');
  const [theme, setTheme] = useState<Theme>('system');

  useEffect(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') setTheme(saved);
  }, []);

  function apply(next: Theme) {
    setTheme(next);
    if (next === 'system') {
      localStorage.removeItem('theme');
      document.documentElement.removeAttribute('data-theme');
    } else {
      localStorage.setItem('theme', next);
      document.documentElement.setAttribute('data-theme', next);
    }
  }

  function cycle() {
    apply(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light');
  }

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={t('toggle')}
      className="inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius-button)] text-[color:var(--label)] transition-colors hover:bg-[color:var(--separator)]"
    >
      <Sun className="h-5 w-5 dark:hidden" aria-hidden />
      <Moon className="hidden h-5 w-5 dark:block" aria-hidden />
    </button>
  );
}
