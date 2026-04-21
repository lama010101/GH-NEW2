"use client";

import Link from "next/link";

export default function HomePage() {
  return (
    <main className="app-shell">
      <div className="shell-grid">
        <section className="hero">
          <h1>Guess History</h1>
          <p>Test your knowledge of historical events.</p>
        </section>

        <section className="card stack">
          <Link href="/compete" className="button">
            Compete
          </Link>
        </section>
      </div>
    </main>
  );
}
