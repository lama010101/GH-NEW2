import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { defaultLocale, LOCALE_COOKIE, locales, type Locale } from './config';

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const raw = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale: Locale =
    raw && (locales as readonly string[]).includes(raw)
      ? (raw as Locale)
      : defaultLocale;

  return {
    locale,
    messages: (await import(`./${locale}.json`)).default,
  };
});
