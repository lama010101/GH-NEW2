import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('legal');
  return {
    title: t('terms.meta_title'),
    description: t('terms.meta_description'),
  };
}

export default async function TermsPage() {
  const t = await getTranslations('legal');
  return (
    <main className="min-h-screen bg-[var(--gh-bg-base)] text-[var(--gh-text-primary)] px-4 py-12">
      <article className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold mb-2">{t('terms.title')}</h1>
        <p className="text-sm text-[var(--gh-text-muted)] mb-8">
          <strong>{t('terms.last_updated')}</strong>
        </p>

        <p className="leading-relaxed mb-6">
          {t('terms.intro')}
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">{t('terms.section1_title')}</h2>
        <p className="leading-relaxed mb-6">
          {t('terms.section1_text')}
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">{t('terms.section2_title')}</h2>
        <p className="leading-relaxed mb-6">
          {t('terms.section2_text')}
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">{t('terms.section3_title')}</h2>
        <p className="leading-relaxed mb-3">
          {t('terms.acceptable_use_intro')}
        </p>
        <ul className="list-disc pl-5 space-y-2 leading-relaxed mb-6">
          <li>{t('terms.use_unlawful')}</li>
          <li>{t('terms.use_exploit')}</li>
          <li>{t('terms.use_bots')}</li>
          <li>{t('terms.use_harass')}</li>
          <li>{t('terms.use_unauthorized')}</li>
        </ul>
        <p className="leading-relaxed mb-6">
          {t('terms.section3_outro')}
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">{t('terms.section4_title')}</h2>
        <p className="leading-relaxed mb-6">
          {t('terms.section4_text')}
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">{t('terms.section5_title')}</h2>
        <p className="leading-relaxed mb-6">
          {t('terms.section5_text')}
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">{t('terms.section6_title')}</h2>
        <p className="leading-relaxed mb-6">
          {t('terms.section6_text')}
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">{t('terms.section7_title')}</h2>
        <p className="leading-relaxed mb-6">
          {t('terms.section7_text')}
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">{t('terms.section8_title')}</h2>
        <p className="leading-relaxed mb-6">
          {t('terms.section8_text')}
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">{t('terms.section9_title')}</h2>
        <p className="leading-relaxed mb-6">
          {t('terms.section9_text')}
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">{t('terms.section10_title')}</h2>
        <p className="leading-relaxed">
          {t('terms.contact_text')}
        </p>
      </article>
    </main>
  );
}
