import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('legal');
  return {
    title: t('privacy.meta_title'),
    description: t('privacy.meta_description'),
  };
}

export default async function PrivacyPage() {
  const t = await getTranslations('legal');
  return (
    <main className="min-h-screen bg-[var(--gh-bg-base)] text-[var(--gh-text-primary)] px-4 py-12">
      <article className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold mb-2">{t('privacy.title')}</h1>
        <p className="text-sm text-[var(--gh-text-muted)] mb-8">
          <strong>{t('privacy.last_updated')}</strong>
        </p>

        <p className="leading-relaxed mb-6">
          {t('privacy.intro')}
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">{t('privacy.section1_title')}</h2>
        <div className="space-y-4 leading-relaxed">
          <p>
            <strong>{t('privacy.account_info_label')}</strong> {t('privacy.account_info_text')}
          </p>
          <p>
            <strong>{t('privacy.gameplay_data_label')}</strong> {t('privacy.gameplay_data_text')}
          </p>
          <p>
            <strong>{t('privacy.usage_data_label')}</strong> {t('privacy.usage_data_text')}
          </p>
          <p>
            <strong>{t('privacy.images_label')}</strong> {t('privacy.images_text')}
          </p>
        </div>

        <h2 className="text-xl font-semibold mt-8 mb-3">{t('privacy.section2_title')}</h2>
        <p className="leading-relaxed mb-3">
          {t('privacy.use_intro')}
        </p>
        <ul className="list-disc pl-5 space-y-2 leading-relaxed mb-6">
          <li>{t('privacy.use_provide')}</li>
          <li>{t('privacy.use_authenticate')}</li>
          <li>{t('privacy.use_track')}</li>
          <li>{t('privacy.use_improve')}</li>
          <li>{t('privacy.use_communicate')}</li>
        </ul>
        <p className="leading-relaxed mb-6">
          {t('privacy.no_sell')}
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">{t('privacy.section3_title')}</h2>
        <p className="leading-relaxed mb-3">
          {t('privacy.providers_intro')}
        </p>
        <ul className="list-disc pl-5 space-y-2 leading-relaxed mb-6">
          <li><strong>{t('privacy.supabase_name')}</strong> {t('privacy.supabase_desc')}</li>
          <li><strong>{t('privacy.google_name')}</strong> {t('privacy.google_desc')}</li>
          <li><strong>{t('privacy.firebase_name')}</strong> {t('privacy.firebase_desc')}</li>
          <li><strong>{t('privacy.vercel_name')}</strong> {t('privacy.vercel_desc')}</li>
          <li><strong>{t('privacy.cloudflare_name')}</strong> {t('privacy.cloudflare_desc')}</li>
        </ul>
        <p className="leading-relaxed mb-6">
          {t('privacy.providers_outro')}
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">{t('privacy.section4_title')}</h2>
        <p className="leading-relaxed mb-6">
          {t('privacy.cookies_text')}
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">{t('privacy.section5_title')}</h2>
        <p className="leading-relaxed mb-6">
          {t('privacy.retention_text')}
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">{t('privacy.section6_title')}</h2>
        <p className="leading-relaxed mb-6">
          {t('privacy.security_text')}
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">{t('privacy.section7_title')}</h2>
        <p className="leading-relaxed mb-6">
          {t('privacy.children_text')}
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">{t('privacy.section8_title')}</h2>
        <p className="leading-relaxed mb-6">
          {t('privacy.contact_text')}
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">{t('privacy.section9_title')}</h2>
        <p className="leading-relaxed">
          {t('privacy.changes_text')}
        </p>
      </article>
    </main>
  );
}
