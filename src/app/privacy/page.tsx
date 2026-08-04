import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Guess-History",
  description: "Privacy Policy for Guess-History",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[var(--gh-bg-base)] text-[var(--gh-text-primary)] px-4 py-12">
      <article className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-sm text-[var(--gh-text-muted)] mb-8">
          <strong>Last updated: August 4, 2026</strong>
        </p>

        <p className="leading-relaxed mb-6">
          Guess-History (&quot;we,&quot; &quot;us,&quot; &quot;our&quot;) operates the website www.guess-history.com (the &quot;Service&quot;), a multiplayer historical geography and year-guessing game. This Privacy Policy explains what information we collect, how we use it, and your rights regarding that information.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">1. Information We Collect</h2>
        <div className="space-y-4 leading-relaxed">
          <p>
            <strong>Account information:</strong> When you sign in via Google or email/password, we receive your email address, display name, and profile picture (if provided by Google). Authentication is handled by Supabase.
          </p>
          <p>
            <strong>Gameplay data:</strong> We store your game sessions, guesses (year and location), scores, accuracy statistics, badges, and leaderboard rankings to operate the Service and show you your history and progress.
          </p>
          <p>
            <strong>Usage data:</strong> We may automatically collect standard technical data such as IP address, browser type, device type, and pages visited, for security, debugging, and service reliability purposes.
          </p>
          <p>
            <strong>Images:</strong> Historical event images used in gameplay are served from our own image infrastructure (Firebase Storage). We do not use your personal photos.
          </p>
        </div>

        <h2 className="text-xl font-semibold mt-8 mb-3">2. How We Use Information</h2>
        <p className="leading-relaxed mb-3">
          We use collected information to:
        </p>
        <ul className="list-disc pl-5 space-y-2 leading-relaxed mb-6">
          <li>Provide, operate, and maintain the Service (game sessions, multiplayer matchmaking, leaderboards)</li>
          <li>Authenticate your account and keep it secure</li>
          <li>Track your scores, stats, badges, and progress across game modes</li>
          <li>Diagnose bugs and improve performance and reliability</li>
          <li>Communicate with you about your account or the Service, if necessary</li>
        </ul>
        <p className="leading-relaxed mb-6">
          We do not sell your personal information. We do not use your data for third-party advertising.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">3. Third-Party Services</h2>
        <p className="leading-relaxed mb-3">
          We use the following third-party service providers to operate Guess-History:
        </p>
        <ul className="list-disc pl-5 space-y-2 leading-relaxed mb-6">
          <li><strong>Supabase</strong> — authentication and database hosting</li>
          <li><strong>Google OAuth</strong> — optional sign-in method</li>
          <li><strong>Firebase Storage</strong> — hosting of game content images</li>
          <li><strong>Vercel</strong> — application hosting</li>
          <li><strong>Cloudflare (via PartyKit)</strong> — real-time multiplayer session infrastructure</li>
        </ul>
        <p className="leading-relaxed mb-6">
          Each provider processes data only as necessary to provide their respective service to us and is bound by their own privacy and security practices.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">4. Cookies and Local Storage</h2>
        <p className="leading-relaxed mb-6">
          We use cookies and browser local storage to maintain your login session and game state (e.g., resuming an in-progress round after a page refresh). These are functional, not advertising, cookies.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">5. Data Retention</h2>
        <p className="leading-relaxed mb-6">
          We retain account and gameplay data for as long as your account is active. You may request deletion of your account and associated data at any time by contacting us (see Section 8).
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">6. Data Security</h2>
        <p className="leading-relaxed mb-6">
          We take reasonable technical and organizational measures to protect your information, including encrypted connections (HTTPS) and access-controlled databases. No method of transmission or storage is 100% secure, and we cannot guarantee absolute security.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">7. Children&apos;s Privacy</h2>
        <p className="leading-relaxed mb-6">
          The Service is not directed at children under 13, and we do not knowingly collect personal information from children under 13.
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">8. Contact Us</h2>
        <p className="leading-relaxed mb-6">
          For privacy questions, data deletion requests, or other concerns, contact us at: appymanya@gmail.com
        </p>

        <h2 className="text-xl font-semibold mt-8 mb-3">9. Changes to This Policy</h2>
        <p className="leading-relaxed">
          We may update this Privacy Policy from time to time. Material changes will be reflected by an updated &quot;Last updated&quot; date on this page.
        </p>
      </article>
    </main>
  );
}
