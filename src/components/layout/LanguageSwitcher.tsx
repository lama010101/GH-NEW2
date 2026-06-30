'use client';

import { LanguageDropdown } from './LanguageDropdown';

interface LanguageSwitcherProps {
  initialLocale: string;
}

export function LanguageSwitcher({ initialLocale }: LanguageSwitcherProps) {
  return <LanguageDropdown initialLocale={initialLocale} />;
}
