// ===== Core User & Auth =====
export type UserRole = 'player' | 'manager';

export interface User {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  createdAt: string;
  avatarUrl?: string;
}

// ===== Positions & Archetypes =====
export type PositionCategory = 'GK' | 'DEF' | 'MID' | 'FWD';

export type Position =
  | 'GK'
  | 'CB' | 'LB' | 'RB' | 'LWB' | 'RWB'
  | 'CDM' | 'CM' | 'CAM' | 'LM' | 'RM'
  | 'LW' | 'RW' | 'CF' | 'ST';

export interface Archetype {
  id: string;
  name: string;
  nameEn: string;
  positions: Position[];
  category: PositionCategory;
  description: string;
  attributeBoosts: Partial<Record<keyof PhysicalAttributes | keyof TechnicalAttributes | keyof MentalAttributes | keyof ShootingAttributes, number>>;
}

// ===== Attributes =====
export interface PhysicalAttributes {
  speed: number;
  acceleration: number;
  agility: number;
  strength: number;
  balance: number;
  stamina: number;
  jumping: number;
  endurance: number;
}

export interface TechnicalAttributes {
  dribbling: number;
  ballControl: number;
  marking: number;
  tackling: number;
  oneTouch: number;
  curve: number;
  shortPassing: number;
  longPassing: number;
}

export interface MentalAttributes {
  vision: number;
  decisionMaking: number;
  anticipation: number;
  teamwork: number;
  courage: number;
  offensivePositioning: number;
  defensivePositioning: number;
}

export interface ShootingAttributes {
  heading: number;
  shotAccuracy: number;
  shotPower: number;
}

export interface GoalkeeperAttributes {
  reflexes: number;
  positioning: number;
  aerialAbility: number;
  handling: number;
  rushing: number;
  oneOnOne: number;
  shortDistribution: number;
  longDistribution: number;
  reactionTime: number;
  areaCommand: number;
}

export interface PlayerAttributes {
  physical: PhysicalAttributes;
  technical: TechnicalAttributes;
  mental: MentalAttributes;
  shooting: ShootingAttributes;
  goalkeeper?: GoalkeeperAttributes;
}

// ===== Player Profile =====
export interface PlayerProfile {
  id: string;
  userId: string;
  name: string;
  age: number;
  nationality: string;
  position: Position;
  secondaryPosition?: Position;
  archetypeId: string;
  attributes: PlayerAttributes;
  energy: number;
  maxEnergy: number;
  reputation: number;
  money: number;
  clubId?: string;
  contractId?: string;
  overallRating: number;
  avatarUrl?: string;
}

// ===== Club =====
export interface Club {
  id: string;
  name: string;
  shortName: string;
  logoUrl?: string;
  managerId?: string;
  leagueId: string;
  reputation: number;
  primaryColor: string;
  secondaryColor: string;
}

export interface ClubFinance {
  clubId: string;
  balance: number;
  weeklyWageBill: number;
  transferBudget: number;
  revenue: ClubRevenue;
  expenses: ClubExpenses;
}

export interface ClubRevenue {
  ticketSales: number;
  leaguePrize: number;
  playerSales: number;
  seasonal: number;
}

export interface ClubExpenses {
  wages: number;
  transfers: number;
  stadiumMaintenance: number;
  fines: number;
  structural: number;
}

// ===== Stadium =====
export type SectorType = 'popular' | 'central' | 'premium' | 'vip' | 'visitor';

export interface StadiumSector {
  type: SectorType;
  capacity: number;
  ticketPrice: number;
  quality: number;
}

export interface Stadium {
  id: string;
  clubId: string;
  name: string;
  totalCapacity: number;
  quality: number;
  prestige: number;
  maintenanceCost: number;
  sectors: StadiumSector[];
}

// ===== Contract =====
export interface Contract {
  id: string;
  playerId: string;
  clubId: string;
  weeklySalary: number;
  durationWeeks: number;
  remainingWeeks: number;
  releaseClause: number;
  status: 'active' | 'expired' | 'terminated';
}

// ===== League & Season =====
export interface League {
  id: string;
  name: string;
  division: number;
  seasonId: string;
  clubIds: string[];
}

export interface Season {
  id: string;
  leagueId: string;
  number: number;
  phase: 'preseason' | 'regular' | 'playoffs' | 'ended';
  currentRound: number;
  totalRounds: number;
}

export interface LeagueStanding {
  clubId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  form: ('W' | 'D' | 'L')[];
}

// ===== Match =====
export type MatchStatus = 'scheduled' | 'live' | 'finished';

export interface Match {
  id: string;
  leagueId: string;
  seasonId: string;
  round: number;
  homeClubId: string;
  awayClubId: string;
  homeScore: number;
  awayScore: number;
  status: MatchStatus;
  date: string;
}

// ===== Tactics =====
export type FormationType = '4-4-2' | '4-3-3' | '4-2-3-1' | '3-5-2' | '5-3-2';
export type TacticalStyle = 'offensive' | 'balanced' | 'defensive' | 'counter' | 'possession' | 'direct' | 'highPress' | 'lowBlock';

export interface TacticalInstructions {
  width: number; // 1-10
  defensiveLine: number;
  pressingIntensity: number;
  tempo: number;
  lateralFocus: 'left' | 'center' | 'right' | 'balanced';
  longBalls: boolean;
  recomposition: number;
  aerialDuels: number;
  markingPriority: 'zonal' | 'man' | 'hybrid';
}

export interface Tactic {
  id: string;
  clubId: string;
  formation: FormationType;
  style: TacticalStyle;
  instructions: TacticalInstructions;
}

// ===== Match Turn Actions =====
export type ActionType =
  | 'shortPass' | 'longPass' | 'shot' | 'orientedControl' | 'dribble'
  | 'carry' | 'shield' | 'header' | 'throughBall'
  | 'runIntoSpace' | 'support' | 'attackDepth' | 'closeLine'
  | 'press' | 'manMark' | 'coverZone' | 'intercept' | 'blockArrow'
  | 'secondBall' | 'prepareControl' | 'prepareHeader' | 'recompose';

export interface ArrowData {
  direction: number; // degrees
  distance: number;
  force: number;
  curve: number;
  difficulty: number;
  expectedAccuracy: number;
  inertiaPenalty: number;
  pressurePenalty: number;
  bodyAlignmentPenalty: number;
  weakFootPenalty: number;
}

export interface MatchAction {
  id: string;
  turnId: string;
  playerId: string;
  actionType: ActionType;
  arrow?: ArrowData;
  targetX: number;
  targetY: number;
  success?: boolean;
}

export type TurnPhase = 'ballCarrier' | 'possession' | 'defending' | 'resolution';

export interface MatchTurn {
  id: string;
  matchId: string;
  turnNumber: number;
  phase: TurnPhase;
  ballCarrierId: string;
  possessionClubId: string;
  ballX: number;
  ballY: number;
  timeRemaining: number;
  actions: MatchAction[];
}

// ===== Inventory & Staff =====
export type ItemCategory = 'boots' | 'accessory' | 'training' | 'recovery';

export interface InventoryItem {
  id: string;
  name: string;
  category: ItemCategory;
  effect: string;
  price: number;
  duration?: number;
}

export type StaffType = 'technicalCoach' | 'physicalCoach' | 'finishingCoach' | 'mentalCoach' | 'physio' | 'recoverySpecialist';

export interface PersonalStaff {
  id: string;
  type: StaffType;
  name: string;
  quality: number;
  costPerWeek: number;
  boost: Partial<Record<string, number>>;
}

// ===== Notifications =====
export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  type: 'contract' | 'transfer' | 'match' | 'training' | 'league' | 'system';
}
