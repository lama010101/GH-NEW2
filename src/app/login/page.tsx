"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/core/supabaseBrowser";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const errorParam = searchParams.get("error");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    errorParam === "missing_code" ? "Sign-in failed: missing authorisation code. Please try again." :
    errorParam === "auth_failed"  ? "Sign-in failed. Please try again." :
    null
  );

  // If already signed in with a real (non-anonymous) account, redirect immediately
  useEffect(() => {
    supabaseBrowser.auth.getSession().then(({ data: { session } }) => {
      if (session?.user && !session.user.is_anonymous) {
        router.replace(next);
      }
    });
  }, [next, router]);

  async function handleGoogleSignIn() {
    setLoading(true);
    setError(null);

    const { error } = await supabaseBrowser.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    }
    // On success, browser navigates away — no further action needed
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-sm bg-gray-900 rounded-2xl p-8 flex flex-col items-center gap-6 shadow-xl">
        <h1 className="text-2xl font-bold text-white tracking-tight">
          Sign in to Guess History
        </h1>

        <p className="text-gray-400 text-sm text-center">
          An account is required to play. Your progress, XP, and stats are saved to your account.
        </p>

        {error && (
          <p className="text-red-400 text-sm text-center bg-red-950 border border-red-800 rounded-lg px-4 py-2 w-full">
            {error}
          </p>
        )}

        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed text-gray-900 font-semibold py-3 px-4 rounded-xl transition-colors duration-150"
        >
          <svg width="20" height="20" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.36-8.16 2.36-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            <path fill="none" d="M0 0h48v48H0z"/>
          </svg>
          {loading ? "Redirecting…" : "Continue with Google"}
        </button>

        <p className="text-gray-600 text-xs text-center">
          By signing in you agree to our terms of service.
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}
