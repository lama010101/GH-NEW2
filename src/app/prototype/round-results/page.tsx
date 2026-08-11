"use client";

// ============================================================================
// PROTOTYPE — Round Results (mirrors the prod /compete/[gameId] ROUND_COMPLETE UI)
// Route: /prototype/round-results   (direct access, mock data)
//
// This page renders the REAL prod per-round results UI: the same shell and the
// same <RoundCompleteSection> component used by the prod compete game page when
// snapshot.status === "ROUND_COMPLETE", fed with a deterministic mock
// CompeteSessionSnapshot + RoundResult[] so it is visually identical to prod
// without any WebSocket / Supabase / API.
//
// Only files inside src/app/prototype/round-results are touched. No prod file
// is modified — prod components are imported, not changed.
//
// Shell parity notes (matches src/app/compete/[gameId]/page.tsx exactly):
//   - <main className={`app-shell ${pageStyles.pageShell}`}> using the SAME
//     page.module.css as the compete page (@/app/compete/[gameId]/page.module.css).
//   - During ROUND_COMPLETE prod renders NO TopBar/NavModal; instead a
//     NotificationBell wrap is shown, and RoundCompleteSection ships its own
//     bottom bar (settings / home / next) + settings modal.
//   - ConnectionStatus renders null when state==="OPEN" && !error, so it is
//     omitted here with no visual difference.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import RoundCompleteSection from "@/components/compete/RoundCompleteSection";
import NotificationBell from "@/components/NotificationBell";
import pageStyles from "@/app/compete/[gameId]/page.module.css";
import protoStyles from "./round-results.module.css";
import type { CompeteSessionSnapshot, RoundEventContent, SessionPlayer } from "@/core/types";
import type { RoundResult } from "@/core/competeTypes";
import type { ConnectionState } from "@/core/competeWebSocket";

const VIEWER_ID = "p1";
const CURRENT_ROUND_INDEX = 2; // 0-indexed -> round 3 of 5
const TOTAL_ROUNDS = 5;

type MockPlayer = { id: string; name: string; isHost: boolean };

const PLAYERS: MockPlayer[] = [
  { id: "p1", name: "Alex Rivera", isHost: true },
  { id: "p2", name: "Mina Kovač", isHost: false },
  { id: "p3", name: "Theo Lambert", isHost: false },
  { id: "p4", name: "Sara Bianchi", isHost: false },
];

// Current round (the one whose results are displayed).
const CURRENT_ROUND = {
  eventId: "evt-berlin",
  title: "Fall of the Berlin Wall",
  year: 1989,
  latitude: 52.52,
  longitude: 13.405,
  locationName: "Berlin, Germany",
  region: "Europe",
  description:
    "Crowds gather at the Brandenburg Gate as the barrier dividing East and West Berlin is opened, a turning point that hastened German reunification.",
};

// Minimal placeholder rounds so snapshot.rounds.length drives the progress dots
// and the "all rounds" leaderboard tab exactly like prod.
function buildRounds(): RoundEventContent[] {
  const titles = [
    "Apollo 11 Moon Landing",
    "Coronation of Elizabeth II",
    CURRENT_ROUND.title,
    "Eiffel Tower Inauguration",
    "Sydney Opera House Opening",
  ];
  const rounds: RoundEventContent[] = [];
  for (let i = 0; i < TOTAL_ROUNDS; i++) {
    const isCurrent = i === CURRENT_ROUND_INDEX;
    rounds.push({
      eventId: isCurrent ? CURRENT_ROUND.eventId : `evt-${i}`,
      title: titles[i] ?? `Round ${i + 1}`,
      year: isCurrent ? CURRENT_ROUND.year : 1900,
      latitude: isCurrent ? CURRENT_ROUND.latitude : 0,
      longitude: isCurrent ? CURRENT_ROUND.longitude : 0,
      locationName: isCurrent ? CURRENT_ROUND.locationName : null,
      region: isCurrent ? CURRENT_ROUND.region : null,
      imageUrl: null,
      description: isCurrent ? CURRENT_ROUND.description : null,
      hints: [],
    });
  }
  return rounds;
}

// Deterministic mock RoundResult[] for the current round (sync mode: the
// component consumes the roundResults prop directly).
const MOCK_ROUND_RESULTS: RoundResult[] = [
  {
    playerId: "p2",
    score: 1980,
    rank: 1,
    accuracy: 99,
    locationScore: 100,
    didSubmit: true,
    guessYear: 1989,
    guessLat: 52.52,
    guessLng: 13.405,
    timeScore: 98,
    badges: [{ dimension: "combo", tier: "gold", accuracy: 99 }],
    nearMisses: [],
    cumulativeScore: 8150,
    cumulativeAccuracy: 94,
  },
  {
    playerId: "p1",
    score: 1840,
    rank: 2,
    accuracy: 94,
    locationScore: 96,
    didSubmit: true,
    guessYear: 1991,
    guessLat: 52.0,
    guessLng: 13.0,
    timeScore: 92,
    badges: [
      { dimension: "combo", tier: "silver", accuracy: 94 },
      { dimension: "location", tier: "gold", accuracy: 96 },
    ],
    nearMisses: [],
    cumulativeScore: 7240,
    cumulativeAccuracy: 89,
  },
  {
    playerId: "p4",
    score: 1530,
    rank: 3,
    accuracy: 83,
    locationScore: 88,
    didSubmit: true,
    guessYear: 1994,
    guessLat: 51.0,
    guessLng: 14.0,
    timeScore: 78,
    badges: [],
    nearMisses: [],
    cumulativeScore: 7300,
    cumulativeAccuracy: 79,
  },
  {
    playerId: "p3",
    score: 1210,
    rank: 4,
    accuracy: 71,
    locationScore: 64,
    didSubmit: true,
    guessYear: 1978,
    guessLat: 50.0,
    guessLng: 10.0,
    timeScore: 78,
    badges: [],
    nearMisses: [],
    cumulativeScore: 5230,
    cumulativeAccuracy: 68,
  },
];

function buildSnapshot(): CompeteSessionSnapshot {
  const now = "2025-01-01T00:00:00.000Z";
  const players: SessionPlayer[] = PLAYERS.map((p) => ({
    playerId: p.id,
    displayName: p.name,
    joinedAt: now,
    leftAt: null,
    ready: true,
    isHost: p.isHost,
    avatarUrl: null,
    hasSubmitted: true,
  }));

  return {
    gameId: "proto-round-results",
    status: "ROUND_COMPLETE",
    config: {
      mode: "sync",
      roundTimerSec: 60,
      totalRounds: TOTAL_ROUNDS,
      yearMin: 1800,
      yearMax: 2025,
      resultsAutoAdvanceSec: 10,
      selectedEras: [],
      selectedRegions: [],
      hostPlayerId: VIEWER_ID,
      sessionDeadline: null,
      sessionDeadlineDays: null,
      startedAt: now,
      completedAt: null,
      referenceYear: 2025,
    },
    players,
    currentRoundIndex: CURRENT_ROUND_INDEX,
    allPlayersReady: true,
    roundStartsAt: null,
    roundEndsAt: null,
    viewerPlayerId: VIEWER_ID,
    rounds: buildRounds(),
    readyForNext: [],
    roomCode: "000000",
    pendingInvitees: [],
  };
}

export default function RoundResultsPrototypePage() {
  const snapshot = useMemo(buildSnapshot, []);
  const roundResults = useMemo<RoundResult[]>(() => MOCK_ROUND_RESULTS, []);

  // Viewer's submitted guess (so distance + Where/When breakdown render like prod).
  const guessLat = 52.0;
  const guessLng = 13.0;

  // No hints purchased in this mock -> the "Hints used" card stays hidden.
  const submittedHintPenaltyRef = useRef({
    accPenalty: 0,
    xpPenalty: 0,
    purchasedIds: [] as string[],
    whereAccPenalty: 0,
    whenAccPenalty: 0,
  });

  // Leaderboard / clue expand state (prod initializes lb expanded = true).
  const [whereLbExpanded, setWhereLbExpanded] = useState(true);
  const [whenLbExpanded, setWhenLbExpanded] = useState(true);
  const [whereCluesExpanded, setWhereCluesExpanded] = useState(false);
  const [whenCluesExpanded, setWhenCluesExpanded] = useState(false);

  // Ticking auto-advance countdown (mirrors prod resultSecsLeft display).
  const [resultSecsLeft, setResultSecsLeft] = useState<number | null>(10);
  useEffect(() => {
    if (resultSecsLeft === null) return;
    if (resultSecsLeft <= 0) return;
    const id = setTimeout(() => setResultSecsLeft((s) => (s === null ? null : Math.max(0, s - 1))), 1000);
    return () => clearTimeout(id);
  }, [resultSecsLeft]);

  const connectionState: ConnectionState = "OPEN";

  return (
    <main className={`app-shell ${pageStyles.pageShell}`}>
      <div className={pageStyles.notificationWrap}>
        <NotificationBell onlyShowWhenUnread />
      </div>
      <div className={pageStyles.bgImage} />
      <div className={pageStyles.bgScrim} style={{ background: "rgba(0, 0, 0, 0.4)" }} />
      <div className={pageStyles.pageContent}>
        <div className="shell-grid">
          <div className={protoStyles.protoWrap}>
            <RoundCompleteSection
              snapshot={snapshot}
              roundResults={roundResults}
              playerId={VIEWER_ID}
              guessLat={guessLat}
              guessLng={guessLng}
              submittedHintPenaltyRef={submittedHintPenaltyRef}
              whereLbExpanded={whereLbExpanded}
              setWhereLbExpanded={setWhereLbExpanded}
              whenLbExpanded={whenLbExpanded}
              setWhenLbExpanded={setWhenLbExpanded}
              whereCluesExpanded={whereCluesExpanded}
              setWhereCluesExpanded={setWhereCluesExpanded}
              whenCluesExpanded={whenCluesExpanded}
              setWhenCluesExpanded={setWhenCluesExpanded}
              resultSecsLeft={resultSecsLeft}
              onAdvanceRound={() => {
                /* no-op in prototype */
              }}
              busy={false}
              connectionState={connectionState}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
