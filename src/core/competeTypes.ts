export type RoundResult = {
  playerId: string;
  score: number;
  rank: number;
  accuracy: number;
  locationScore: number;
  didSubmit: boolean;
  guessYear: number | null;
  guessLat?: number | null;
  guessLng?: number | null;
  timeScore: number;
  badges: Array<{ dimension: 'year' | 'location' | 'combo'; tier: 'gold' | 'silver' | 'bronze'; accuracy: number }>;
  nearMisses: Array<{ dimension: 'year' | 'location' | 'combo'; accuracy: number }>;
  cumulativeScore: number;
  cumulativeAccuracy: number;
};

export type AllRoundResult = {
  playerId: string;
  roundIndex: number;
  score: number;
  rank: number;
  distanceKm: number | null;
  yearDiff: number | null;
  locationScore: number | null;
  timeScore: number | null;
  didSubmit: boolean;
  region: string | null;
};
