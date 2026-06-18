import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Bebas_Neue, DM_Sans, Sora } from "next/font/google";
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { cookies } from 'next/headers';
import { defaultLocale, LOCALE_COOKIE, locales, type Locale } from '@/i18n/config';
import "./globals.css";

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

export const metadata: Metadata = {
  title: "Guess-History Practice",
  description: "Deterministic historical guessing game"
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale: Locale =
    raw && (locales as readonly string[]).includes(raw)
      ? (raw as Locale)
      : defaultLocale;
  const messages = await getMessages({ locale });

  return (
    <html lang={locale} suppressHydrationWarning className={`${bebasNeue.variable} ${dmSans.variable} ${sora.variable}`}>
      <body suppressHydrationWarning>
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
