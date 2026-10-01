// Journey result override for SessionComplete (HJ-FIX-JOURNEYRESULT-PROTECTEDPROP-023).
// When present, the shared results component renders journey-specific pieces
// (pass/fail headline, pass-mark panel, two-button CTA); when absent it renders
// exactly as before. Fields mirror the client-usable subset of
// CompleteJourneyPlaythroughResult in src/server/journeyCore.ts.
export interface JourneyResultOverride {
  stageId: string;
  stageNumber: number;
  accuracyPct: number;
  minAccuracyPct: number;
  gatePassed: boolean;
}
