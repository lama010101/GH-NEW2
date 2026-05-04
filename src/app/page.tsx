"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { bootstrapIdentity, signOut, type IdentityState } from "@/core/identity";

export default function HomePage() {
  const router = useRouter();
  const [identity, setIdentity] = useState<IdentityState>({ status: "loading" });
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    bootstrapIdentity().then(setIdentity);
  }, []);

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    router.replace("/login");
  }

  const isAuthenticated = identity.status === "ready" && !identity.isAnonymous;

  return (
    <>
      <div style={{ position: "fixed", top: 16, right: 16, zIndex: 50 }}>
        {identity.status === "loading" && (
          <span style={{ color: "#9ca3af", fontSize: 14 }}>Loading…</span>
        )}
        {identity.status === "unauthenticated" && (
          <Link
            href="/login"
            style={{
              background: "#7c3aed",
              color: "#fff",
              padding: "8px 18px",
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 14,
              textDecoration: "none",
            }}
          >
            Sign in
          </Link>
        )}
        {isAuthenticated && (
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            style={{
              background: "#374151",
              color: "#f3f4f6",
              border: "none",
              padding: "8px 18px",
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 14,
              cursor: signingOut ? "not-allowed" : "pointer",
              opacity: signingOut ? 0.6 : 1,
            }}
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        )}
      </div>

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
    </>
  );
}
