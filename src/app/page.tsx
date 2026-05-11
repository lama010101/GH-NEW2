"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { bootstrapIdentity, subscribeToIdentityChanges, signOut, type IdentityState } from "@/core/identity";
import { AuthModal } from "@/components/AuthModal";

function HomePageInner() {
  const searchParams = useSearchParams();
  const [identity, setIdentity] = useState<IdentityState>({ status: "loading" });
  const [showAuthModal, setShowAuthModal] = useState(false);

  useEffect(() => {
    bootstrapIdentity().then(setIdentity);
    const unsubscribe = subscribeToIdentityChanges(setIdentity);
    return unsubscribe;
  }, []);

  useEffect(() => {
    const next = searchParams.get("next");
    if (next && identity.status === "unauthenticated") {
      setShowAuthModal(true);
    }
  }, [searchParams, identity.status]);



  return (
    <>
      <div style={{ position: "fixed", top: 16, right: 16, zIndex: 50 }}>
        {identity.status === "loading" && (
          <span style={{ color: "#9ca3af", fontSize: 14 }}>Loading…</span>
        )}
        {(identity.status === "unauthenticated" || identity.status === "ready") && (
          <>
            {identity.status === "ready" && (
              <Link
                href="/profile"
                style={{
                  color: "#f5f0e8",
                  fontSize: 14,
                  marginRight: 12,
                  textDecoration: "none",
                  fontWeight: 500
                }}
              >
                Profile
              </Link>
            )}
            <button
              onClick={async () => {
                if (identity.status === "ready") {
                  await signOut();
                } else {
                  setShowAuthModal(true);
                }
              }}
              style={{
                background: identity.status === "ready" ? "transparent" : "#7c3aed",
                color: "#fff",
                padding: "8px 18px",
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 14,
                border: identity.status === "ready" ? "1px solid rgba(255,255,255,0.3)" : "none",
                cursor: "pointer",
              }}
            >
              {identity.status === "ready" ? "Sign out" : "Sign in"}
            </button>
          </>
        )}
      </div>

      <main className="app-shell">
        <div className="shell-grid">
          <section className="hero">
            <h1>Guess History</h1>
            <p>Test your knowledge of historical events.</p>
          </section>

          <section className="card stack">
            <Link
              href="/compete"
              onClick={(e) => {
                if (identity.status !== "ready") {
                  e.preventDefault();
                  setShowAuthModal(true);
                }
              }}
              style={{
                opacity: identity.status !== "ready" ? 0.5 : 1,
                pointerEvents: "auto",
              }}
            >
              Compete
            </Link>
          </section>
        </div>
      </main>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />
    </>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomePageInner />
    </Suspense>
  );
}
