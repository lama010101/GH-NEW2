export const locales = ['en', 'fr', 'es', 'de', 'it', 'pt', 'nl', 'ru', 'ja', 'zh'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';
export const LOCALE_COOKIE = 'gh_locale';

export const localeMeta: Record<Locale, { label: string; flag: string }> = {
  en: { label: 'English',    flag: '🇬🇧' },
  fr: { label: 'Français',   flag: '🇫🇷' },
  es: { label: 'Español',    flag: '🇪🇸' },
  de: { label: 'Deutsch',    flag: '🇩🇪' },
  it: { label: 'Italiano',   flag: '🇮🇹' },
  pt: { label: 'Português (BR)', flag: '🇧🇷' },
  nl: { label: 'Nederlands', flag: '🇳🇱' },
  ru: { label: 'Русский',    flag: '🇷🇺' },
  ja: { label: '日本語',      flag: '🇯🇵' },
  zh: { label: '中文',        flag: '🇨🇳' },
};
