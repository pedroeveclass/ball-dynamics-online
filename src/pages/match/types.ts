// ─── Types ────────────────────────────────────────────────────

export interface MatchData {
  id: string; status: string; home_score: number; away_score: number;
  current_phase: string | null; current_turn_number: number;
  scheduled_at: string; started_at: string | null;
  home_club_id: string; away_club_id: string;
  home_lineup_id: string | null; away_lineup_id: string | null;
  possession_club_id: string | null;
  home_uniform?: number; away_uniform?: number;
  half_started_at?: string | null;
  current_half?: number;
  injury_time_turns?: number;
  injury_time_start_turn?: number | null;
}

export interface ClubInfo {
  id: string; name: string; short_name: string;
  primary_color: string; secondary_color: string; formation?: string;
  crest_url?: string | null;
}

export interface Participant {
  id: string; match_id: string; player_profile_id: string | null;
  club_id: string; lineup_slot_id: string | null; role_type: string;
  is_bot: boolean; connected_user_id: string | null;
  pos_x: number | null; pos_y: number | null;
  pickup_slot_id?: string | null;
  player_name?: string; slot_position?: string; overall?: number;
  field_x?: number; field_y?: number; field_pos?: string;
  jersey_number?: number;
  match_energy?: number;
  is_ready?: boolean;
  yellow_cards?: number;
  is_sent_off?: boolean;
  country_code?: string | null;
}

export interface MatchTurn {
  id: string; turn_number: number; phase: string;
  possession_club_id: string | null; ball_holder_participant_id: string | null;
  started_at: string; ends_at: string; status: string;
  set_piece_type?: string | null;
  ball_x?: number | null;
  ball_y?: number | null;
  resolution_script?: ResolutionScript | null;
}

// Server-authoritative payload describing the full outcome of a resolution
// turn. The engine writes this atomically with the turn's status transition
// so the client animator can replay a deterministic script instead of
// polling individual event logs.
export interface ResolutionScript {
  version: 1;
  turn_number: number;
  duration_ms: number;
  interrupt_progress: number | null;
  initial_positions: Record<string, { x: number; y: number }>;
  final_positions: Record<string, { x: number; y: number }>;
  events: Array<{
    event_type: string;
    title?: string;
    body?: string;
    payload?: Record<string, any> | null;
  }>;
  ball_end_pos: { x: number; y: number } | null;
  next_turn: {
    phase: string;
    possession_club_id: string | null;
    ball_holder_participant_id: string | null;
    set_piece_type: string | null;
  };
  scores: { home: number; away: number };
}

export interface EventLog {
  id: string; event_type: string; title: string; body: string; created_at: string; payload?: Record<string, any> | null;
}

export interface MatchAction {
  id: string;
  match_id: string;
  match_turn_id: string;
  participant_id: string;
  controlled_by_type: string;
  controlled_by_user_id?: string | null;
  action_type: string;
  target_x: number | null;
  target_y: number | null;
  target_participant_id: string | null;
  status: string;
  created_at?: string;
  turn_phase?: string | null;
  turn_number?: number;
  payload?: any;
}

export interface ClubUniform {
  uniform_number: number;
  shirt_color: string;
  number_color: string;
  pattern: string;
  stripe_color: string;
}

export interface PendingInterceptChoice {
  participantId: string;
  targetX: number;
  targetY: number;
  trajectoryActionType?: string;
  trajectoryProgress?: number;
}

export interface PlayerProfileSummary {
  id: string;
  full_name: string | null;
  primary_position: string | null;
  secondary_position?: string | null;
  overall: number | null;
  jersey_number?: number | null;
  country_code?: string | null;
}

export interface LineupSlotSummary {
  id: string;
  slot_position: string | null;
  sort_order: number | null;
}

export interface TurnMeta {
  phase: string | null;
  turn_number: number | null;
}

export interface DrawingState {
  type: 'move' | 'pass_low' | 'pass_high' | 'pass_launch' | 'shoot_controlled' | 'shoot_power' | 'header_low' | 'header_high' | 'header_controlled' | 'header_power' | 'block';
  fromParticipantId: string;
}
