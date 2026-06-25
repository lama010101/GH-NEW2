'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { LOCALE_COOKIE, locales, type Locale } from '@/i18n/config';
import { createAuthenticatedServerClient } from '@/core/supabaseServer';

export async function setLocale(locale: Locale): Promise<void> {
  if (!(locales as readonly string[]).includes(locale)) return;
  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 year
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });

  // Persist to the user's profile row when signed in.
  // If not signed in (e.g. toggling in AuthModal pre-auth), the cookie alone
  // drives the runtime locale; the profile row is updated on a later signed-in call.
  try {
    const supabase = createAuthenticatedServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from('profiles')
        .update({ locale, updated_at: new Date().toISOString() })
        .eq('id', user.id);
    }
  } catch {
    // Non-fatal: cookie is already set, UI locale switches regardless.
  }

  revalidatePath('/', 'layout');
}
