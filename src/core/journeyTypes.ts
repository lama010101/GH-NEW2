export type JourneyStageStatus = 'draft' | 'approved' | 'live';

export type JourneyStageEventStatus = 'proposed' | 'approved' | 'rejected';

export type JourneyPlayerProgressStatus = 'locked' | 'unlocked' | 'completed';

export type JourneyBadge = 'gold' | 'silver' | 'bronze' | 'completion' | null;

export type JourneyStage = {
  id: string;
  stage_number: number;
  title: string | null;
  theme: string | null;
  learning_objective: string | null;
  difficulty_rating: number | null;
  min_accuracy_pct: number;
  pool_size: number;
  status: JourneyStageStatus;
  created_at: string;
  updated_at: string;
};

export type JourneyStageEvent = {
  id: string;
  stage_id: string;
  event_id: string;
  status: JourneyStageEventStatus;
  display_order: number;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type JourneyPlayerProgress = {
  id: string;
  player_id: string;
  stage_id: string;
  status: JourneyPlayerProgressStatus;
  best_accuracy_pct: number | null;
  best_badge: JourneyBadge;
  attempts_count: number;
  first_completed_at: string | null;
  last_played_at: string | null;
  created_at: string;
  updated_at: string;
};

export type JourneyPlaythrough = {
  id: string;
  player_id: string;
  stage_id: string;
  session_id: string | null;
  accuracy_pct: number;
  badge_awarded: JourneyBadge;
  xp_awarded: number;
  completed_at: string;
  created_at: string;
};

export type JourneyStageWithProgress = JourneyStage & {
  progress: JourneyPlayerProgress | null;
  computed_status: JourneyPlayerProgressStatus;
};
