"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useIdentity } from "@/hooks/useIdentity";
import { supabaseBrowser } from "@/core/supabaseBrowser";
import pageStyles from "@/app/practice/page.module.css";

export default function DailyEntryPage() {
  const router = useRouter();
  const t = useTranslations("game");
  const tCommon = useTranslations("common");
  const { playerId, isLoading: identityLoading, error: identityError } = useIdentity();
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (identityLoading || identityError || !playerId || starting) return;

    let cancelled = false;
    setStarting(true);

    (async () => {
      try {
        const { data: { session } } = await supabaseBrowser.auth.getSession();
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
              fontSize: "14px",
            }}
          >
            {tCommon("back_to_home")}
          </button>
        )}
      </div>
    </div>
  );
}
