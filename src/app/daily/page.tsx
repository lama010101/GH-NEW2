"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useIdentity } from "@/hooks/useIdentity";
import { readSession } from "@/core/supabaseBrowser";
import { forceClearAuthStorage, bootstrapIdentity, subscribeToIdentityChanges, type IdentityState } from '@/core/identity';
import pageStyles from "@/app/practice/page.module.css";

export default function DailyEntryPage() {
  const router = useRouter();
  const t = useTranslations("game");
  const tCommon = useTranslations("common");
  const { playerId, isLoading: identityLoading, error: identityError } = useIdentity();
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [showLoadingTimeout, setShowLoadingTimeout] = useState(false);
  const [identity, setIdentity] = useState<IdentityState>({ status: 'loading' });

  const handleForceClear = () => {
    forceClearAuthStorage()
    window.location.replace('/login')
  }

  const handleIdentityRetry = () => {
    setIdentity({ status: 'loading' })
    bootstrapIdentity().then(setIdentity)
  }

  // Identity state management for escape hatch
  useEffect(() => {
    let mounted = true;
    bootstrapIdentity().then(state => {
      if (mounted) setIdentity(state);
    });
    const unsubscribe = subscribeToIdentityChanges(state => {
      if (mounted) setIdentity(state);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  // Show escape hatch after 10s of continuous loading
  useEffect(() => {
    if (identity.status === 'ready') {
      setShowLoadingTimeout(false)
      return
    }
    const timer = setTimeout(() => setShowLoadingTimeout(true), 10000)
    return () => clearTimeout(timer)
  }, [identity.status])

  useEffect(() => {
    if (identityLoading || identityError || !playerId || starting) return;

    let cancelled = false;
    setStarting(true);

    (async () => {
      try {
        const session = await readSession();
        const accessToken = session?.access_token;
        if (!accessToken) {
          setError(t("not_authenticated"));
          return;
        }

        const response = await fetch("/api/daily/start", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error ?? t("failed_load_session"));
        }

        const result = (await response.json()) as {
          status: "new" | "resume" | "completed";
          gameId: string;
        };
        if (cancelled) return;

        if (!result.gameId) {
          throw new Error(t("no_game_id_response"));
        }

        // /daily/game/[gameId] handles the redirect to the correct round
        // or results page based on the session snapshot.
        router.replace(`/daily/game/${result.gameId}`);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : t("failed_start_practice"));
      } finally {
        if (!cancelled) setStarting(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [playerId, identityLoading, identityError, router, starting, t]);

  return (
    <div className={pageStyles.loadingScreen}>
      <div className={pageStyles.loadingBg} aria-hidden="true" />
      <div className={pageStyles.loadingScrim} aria-hidden="true" />
      <div className={pageStyles.loadingContent}>
        <div className={pageStyles.loadingSpinner} />
        <span className={pageStyles.loadingLabel}>
          {identityError ? t("identity_error") : error ?? t("loading_game")}
        </span>
        {error && (
          <button
            onClick={() => router.push("/home")}
            style={{
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.3)",
              borderRadius: "8px",
              color: "white",
              padding: "8px 16px",
              cursor: "pointer",
              fontSize: "var(--font-sm)",
            }}
          >
            {tCommon("back_to_home")}
          </button>
        )}
        {identity.status === 'error' && (
          <>
            <button
              type="button"
              onClick={handleIdentityRetry}
              style={{ marginTop: 16, padding: '10px 24px', borderRadius: 999, border: 'none', background: 'rgba(255,255,255,0.22)', color: 'var(--gh-text-primary, #fff)', fontSize: 'var(--font-base)', cursor: 'pointer' }}
            >
              {t('game.retry')}
            </button>
            <button
              type="button"
              onClick={handleForceClear}
              style={{ marginTop: 8, padding: '10px 24px', borderRadius: 999, border: 'none', background: 'rgba(255,100,100,0.3)', color: 'var(--gh-text-primary, #fff)', fontSize: 'var(--font-base)', cursor: 'pointer' }}
            >
              {t('game.clear_session_restart')}
            </button>
          </>
        )}
        {identity.status !== 'ready' && identity.status !== 'error' && showLoadingTimeout && (
          <>
            <div style={{ marginTop: 8, fontSize: 'var(--font-sm)', opacity: 0.8 }}>{t('game.taking_too_long')}</div>
            <button
              type="button"
              onClick={handleForceClear}
              style={{ marginTop: 16, padding: '10px 24px', borderRadius: 999, border: 'none', background: 'rgba(255,100,100,0.3)', color: 'var(--gh-text-primary, #fff)', fontSize: 'var(--font-base)', cursor: 'pointer' }}
            >
              {t('game.clear_session_restart')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
