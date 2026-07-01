import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Bebas_Neue, DM_Sans, Sora } from "next/font/google";
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { cookies } from 'next/headers';
import { defaultLocale, LOCALE_COOKIE, locales, rtlLocales, type Locale } from '@/i18n/config';
import { THEME_COOKIE, type Theme, resolveTheme } from '@/lib/theme';
import "./globals.css";

/**
 * Anti-FOUC + hydration-reconcile script.
 * layout.tsx sets data-theme from the gh_theme cookie on the server. The client
 * may have a newer override in localStorage (written by useTheme). This script
 * runs before paint and reconciles the <html data-theme> attribute with
 * localStorage so the first paint matches the user's last choice and there is
 * no flash. localStorage is the client override source; cookie is the SSR
 * source of truth. Single write path for client mutation lives in useTheme.
 */
const THEME_INIT_SCRIPT = `(function(){try{var k='gh_theme';var ls=localStorage.getItem(k);if(ls==='light'||ls==='dark'){document.documentElement.setAttribute('data-theme',ls);}}catch(e){}})();`;

const bebasNeue = Bebas_Neue({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-bebas',
  display: 'swap',
});

const sora = Sora({
  subsets: ['latin'],
  weight: ['700'],
  variable: '--font-sora',
  display: 'swap',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-dm-sans',
  display: 'swap',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('landing');
  return {
    title: t('meta_title'),
    description: t('meta_description'),
  };
}

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale: Locale =
    raw && (locales as readonly string[]).includes(raw)
      ? (raw as Locale)
      : defaultLocale;
  const themeRaw = cookieStore.get(THEME_COOKIE)?.value;
  const theme: Theme = resolveTheme(themeRaw);
  const messages = await getMessages({ locale });

  return (
    <html
      lang={locale}
      dir={rtlLocales.has(locale) ? 'rtl' : 'ltr'}
      data-theme={theme}
      suppressHydrationWarning
      className={`${bebasNeue.variable} ${dmSans.variable} ${sora.variable}`}
    >
      <body suppressHydrationWarning>
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </body>
    </html>
  );
}
