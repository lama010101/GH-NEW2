import { ImageResponse } from "next/og";
import {
  isValidGameId,
  fetchAvatarAsDataUri,
  getSessionStatusAndPlayers,
  fallbackResponse,
} from "@/server/ogImageHelpers";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: { gameId: string } }) {
  try {
    if (!isValidGameId(params.gameId)) {
      return fallbackResponse();
    }

    const sessionData = await getSessionStatusAndPlayers(params.gameId);
    if (!sessionData) {
      return fallbackResponse();
    }

    const { status, players } = sessionData;

    if (status === "SESSION_COMPLETE") {
      // TODO(Task B): replace with result card
      return fallbackResponse();
    }

    const host = players.find((p) => p.isHost && p.leftAt === null);
    if (!host || !host.displayName) {
      return fallbackResponse();
    }

    const avatarDataUri = await fetchAvatarAsDataUri(host.avatarUrl);
    const initials = host.displayName.slice(0, 2).toUpperCase();

    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#080c14",
            backgroundImage:
              "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(30, 64, 175, 0.18) 0%, transparent 70%)",
            fontFamily: "system-ui, -apple-system, sans-serif",
            color: "#ffffff",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 6,
              backgroundColor: "#f0c060",
            }}
          />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 32,
            }}
          >
            {avatarDataUri ? (
              <img
                src={avatarDataUri}
                alt={host.displayName}
                width={160}
                height={160}
                style={{ borderRadius: "50%", objectFit: "cover" }}
              />
            ) : (
              <div
                style={{
                  width: 160,
                  height: 160,
                  borderRadius: "50%",
                  backgroundColor: "#f0c060",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 64,
                  fontWeight: "bold",
                  color: "#080c14",
                }}
              >
                {initials}
              </div>
            )}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                fontSize: 52,
                fontWeight: "bold",
                maxWidth: 700,
              }}
            >
              <div style={{ color: "#ffffff" }}>{host.displayName}</div>
              <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 36, marginTop: 8 }}>
                invited you to a game
              </div>
            </div>
          </div>
          <div
            style={{
              position: "absolute",
              bottom: 32,
              right: 48,
              fontSize: 24,
              color: "#f0c060",
              fontWeight: "bold",
              letterSpacing: 2,
            }}
          >
            Guess History
          </div>
        </div>
      ),
      {
        ...size,
        headers: {
          "Cache-Control":
            "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
        },
      }
    );
  } catch {
    return fallbackResponse();
  }
}
