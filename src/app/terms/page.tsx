import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — Guess-History",
  description: "Terms of Service for Guess-History",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[var(--gh-bg-base)] text-[var(--gh-text-primary)] px-4 py-12">
      <article className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
        <p className="text-sm text-[var(--gh-text-muted)] mb-8">
          <strong>Last updated: August 4, 2026</strong>
        </p>

        <p className="leading-relaxed mb-6">
          Welcome to Guess-History (&quot;Service&quot;), operated at www.guess-history.com. By accessing or using the Service, you agree to be bound by these Terms of Service (&quot;Terms&quot;). If you do not agree, do not use the Service.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">1. Description of Service</h2>
        <p className="leading-relaxed mb-6">
          Guess-History is a multiplayer and single-player game where players guess the year and location of historical events depicted in images, compete on leaderboards, and play against friends or the community.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">2. Accounts</h2>
        <p className="leading-relaxed mb-6">
          You must create an account (via Google or email/password) to access most features. You are responsible for maintaining the confidentiality of your account and for all activity under it. You must provide accurate information and are responsible for keeping it up to date.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">3. Acceptable Use</h2>
        <p className="leading-relaxed mb-3">
          You agree not to:
        </p>
        <ul className="list-disc pl-5 space-y-2 leading-relaxed mb-6">
          <li>Use the Service for any unlawful purpose</li>
          <li>Attempt to disrupt, exploit, or reverse-engineer game mechanics, scoring, or multiplayer infrastructure</li>
          <li>Use bots, scripts, or automated means to play on your behalf outside of any officially sanctioned AI-player features</li>
          <li>Harass, abuse, or impersonate other users</li>
          <li>Attempt to gain unauthorized access to accounts, data, or systems</li>
        </ul>
        <p className="leading-relaxed mb-6">
          We reserve the right to suspend or terminate accounts that violate these Terms.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">4. User Content</h2>
        <p className="leading-relaxed mb-6">
          Any display names, avatars, or other content you submit must not be offensive, infringing, or unlawful. We reserve the right to remove or moderate such content at our discretion.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">5. Intellectual Property</h2>
        <p className="leading-relaxed mb-6">
          The Service, including its game design, software, and branding, is owned by Guess-History and its creators. Historical event images used in gameplay are used for educational/informational purposes; rights to underlying source images remain with their respective owners where applicable.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">6. Disclaimer of Warranties</h2>
        <p className="leading-relaxed mb-6">
          The Service is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind, express or implied. We do not guarantee the Service will be uninterrupted, error-free, or secure at all times.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">7. Limitation of Liability</h2>
        <p className="leading-relaxed mb-6">
          To the maximum extent permitted by law, Guess-History and its operators shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the Service.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">8. Changes to the Service</h2>
        <p className="leading-relaxed mb-6">
          We may modify, suspend, or discontinue any part of the Service at any time, including game modes, features, or scoring systems, without prior notice.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">9. Changes to These Terms</h2>
        <p className="leading-relaxed mb-6">
          We may update these Terms from time to time. Continued use of the Service after changes take effect constitutes acceptance of the revised Terms.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">10. Contact Us</h2>
        <p className="leading-relaxed">
          For questions about these Terms, contact us at: appymanya@gmail.com
        </p>
      </article>
    </main>
  );
}
