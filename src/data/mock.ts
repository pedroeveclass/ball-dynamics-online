import type {
  User, PlayerProfile, Club, ClubFinance, Stadium, Contract,
  League, Season, LeagueStanding, Match, Tactic, PlayerAttributes,
  Archetype, Notification,
} from '@/types/game';

// ===== Users =====
export const mockUsers: User[] = [
  { id: 'u1', username: 'CarlosMendes', email: 'carlos@pt.com', role: 'player', createdAt: '2025-01-10' },
  { id: 'u2', username: 'LucasManager', email: 'lucas@br.com', role: 'manager', createdAt: '2025-01-05' },
  { id: 'u3', username: 'RafaSilva', email: 'rafa@pt.com', role: 'player', createdAt: '2025-02-12' },
];

export const currentUser: User = mockUsers[0];

// ===== Archetypes =====
export const archetypes: Archetype[] = [
  { id: 'a1', name: 'Cherife', nameEn: 'Commander', positions: ['CB'], category: 'DEF', description: 'Defensor dominante e líder da linha de trás.', attributeBoosts: {} },
  { id: 'a2', name: 'Regista', nameEn: 'Regista', positions: ['CDM', 'CM'], category: 'MID', description: 'Ditador do ritmo, controla o meio-campo com passes precisos.', attributeBoosts: {} },
  { id: 'a3', name: 'Finalizador', nameEn: 'Poacher', positions: ['ST', 'CF'], category: 'FWD', description: 'Matador de área. Vive para o gol.', attributeBoosts: {} },
  { id: 'a4', name: 'Armador', nameEn: 'Playmaker', positions: ['CAM', 'CM'], category: 'MID', description: 'Cérebro criativo, encontra espaços invisíveis.', attributeBoosts: {} },
  { id: 'a5', name: 'Ala Ofensivo', nameEn: 'Attacking Wing-Back', positions: ['LWB', 'RWB', 'LB', 'RB'], category: 'DEF', description: 'Lateral que ataca mais do que defende.', attributeBoosts: {} },
  { id: 'a6', name: 'Driblador', nameEn: 'Dribbler', positions: ['LW', 'RW'], category: 'FWD', description: 'Mestre do 1v1, desequilibra com dribles.', attributeBoosts: {} },
  { id: 'a7', name: 'Shot-stopper', nameEn: 'Shot-stopper', positions: ['GK'], category: 'GK', description: 'Goleiro especialista em defesas difíceis.', attributeBoosts: {} },
];

// ===== Attributes helper =====
const makeAttributes = (ovr: number): PlayerAttributes => {
  const base = Math.round(ovr * 0.9);
  const high = Math.min(99, Math.round(ovr * 1.1));
  return {
    physical: { speed: high, acceleration: base, agility: base, strength: base, balance: base, stamina: high, jumping: base, endurance: base },
    technical: { dribbling: base, ballControl: high, marking: base, tackling: base, oneTouch: base, curve: base, shortPassing: high, longPassing: base },
    mental: { vision: high, decisionMaking: base, anticipation: base, teamwork: base, courage: base, offensivePositioning: base, defensivePositioning: base },
    shooting: { heading: base, shotAccuracy: base, shotPower: base },
  };
};

// ===== Clubs =====
export const clubs: Club[] = [
  { id: 'c1', name: 'Atlético Ferro', shortName: 'AFR', managerId: 'u2', leagueId: 'l1', reputation: 78, primaryColor: '#1E293B', secondaryColor: '#3B82F6' },
  { id: 'c2', name: 'Estrela do Sul', shortName: 'EDS', managerId: undefined, leagueId: 'l1', reputation: 72, primaryColor: '#DC2626', secondaryColor: '#FBBF24' },
  { id: 'c3', name: 'União Progresso', shortName: 'UNP', managerId: undefined, leagueId: 'l1', reputation: 68, primaryColor: '#059669', secondaryColor: '#F8FAFC' },
  { id: 'c4', name: 'Porto Vanguarda', shortName: 'PVG', managerId: undefined, leagueId: 'l1', reputation: 75, primaryColor: '#7C3AED', secondaryColor: '#F8FAFC' },
  { id: 'c5', name: 'Real Montanha', shortName: 'RMT', managerId: undefined, leagueId: 'l1', reputation: 65, primaryColor: '#0D9488', secondaryColor: '#1E293B' },
  { id: 'c6', name: 'Cidade Nova FC', shortName: 'CNF', managerId: undefined, leagueId: 'l1', reputation: 62, primaryColor: '#EA580C', secondaryColor: '#1E293B' },
];

// ===== Players =====
export const players: PlayerProfile[] = [
  { id: 'p1', userId: 'u1', name: 'Carlos Mendes', age: 24, nationality: 'BR', position: 'CM', secondaryPosition: 'CAM', archetypeId: 'a4', attributes: makeAttributes(74), energy: 85, maxEnergy: 100, reputation: 68, money: 15200, clubId: 'c1', contractId: 'ct1', overallRating: 74 },
  { id: 'p2', userId: 'u3', name: 'Rafa Silva', age: 22, nationality: 'PT', position: 'RW', archetypeId: 'a6', attributes: makeAttributes(71), energy: 92, maxEnergy: 100, reputation: 60, money: 8400, clubId: 'c1', contractId: 'ct2', overallRating: 71 },
  { id: 'p3', userId: '', name: 'Diego Torres', age: 28, nationality: 'AR', position: 'ST', archetypeId: 'a3', attributes: makeAttributes(79), energy: 78, maxEnergy: 100, reputation: 76, money: 0, clubId: 'c1', contractId: 'ct3', overallRating: 79 },
  { id: 'p4', userId: '', name: 'André Luiz', age: 26, nationality: 'BR', position: 'CB', archetypeId: 'a1', attributes: makeAttributes(76), energy: 90, maxEnergy: 100, reputation: 72, money: 0, clubId: 'c1', contractId: 'ct4', overallRating: 76 },
  { id: 'p5', userId: '', name: 'Kenji Tanaka', age: 23, nationality: 'JP', position: 'CDM', archetypeId: 'a2', attributes: makeAttributes(72), energy: 88, maxEnergy: 100, reputation: 58, money: 0, clubId: 'c2', overallRating: 72 },
  { id: 'p6', userId: '', name: 'Marco Ricci', age: 30, nationality: 'IT', position: 'GK', archetypeId: 'a7', attributes: makeAttributes(77), energy: 95, maxEnergy: 100, reputation: 74, money: 0, clubId: 'c1', overallRating: 77, },
];

// ===== Contracts =====
export const contracts: Contract[] = [
  { id: 'ct1', playerId: 'p1', clubId: 'c1', weeklySalary: 2800, durationWeeks: 48, remainingWeeks: 32, releaseClause: 120000, status: 'active' },
  { id: 'ct2', playerId: 'p2', clubId: 'c1', weeklySalary: 1900, durationWeeks: 36, remainingWeeks: 24, releaseClause: 80000, status: 'active' },
  { id: 'ct3', playerId: 'p3', clubId: 'c1', weeklySalary: 4500, durationWeeks: 52, remainingWeeks: 40, releaseClause: 250000, status: 'active' },
  { id: 'ct4', playerId: 'p4', clubId: 'c1', weeklySalary: 3200, durationWeeks: 52, remainingWeeks: 44, releaseClause: 180000, status: 'active' },
];

// ===== Club Finance =====
export const clubFinances: ClubFinance[] = [
  {
    clubId: 'c1', balance: 1250000, weeklyWageBill: 42000, transferBudget: 350000,
    revenue: { ticketSales: 180000, leaguePrize: 50000, playerSales: 0, seasonal: 25000 },
    expenses: { wages: 546000, transfers: 120000, stadiumMaintenance: 28000, fines: 0, structural: 15000 },
  },
];

// ===== Stadium =====
export const stadiums: Stadium[] = [
  {
    id: 's1', clubId: 'c1', name: 'Arena Ferro', totalCapacity: 28000, quality: 72, prestige: 68, maintenanceCost: 4500,
    sectors: [
      { type: 'popular', capacity: 12000, ticketPrice: 25, quality: 60 },
      { type: 'central', capacity: 8000, ticketPrice: 55, quality: 75 },
      { type: 'premium', capacity: 5000, ticketPrice: 120, quality: 85 },
      { type: 'vip', capacity: 1500, ticketPrice: 350, quality: 95 },
      { type: 'visitor', capacity: 1500, ticketPrice: 30, quality: 55 },
    ],
  },
];

// ===== League & Season =====
export const leagues: League[] = [
  { id: 'l1', name: 'Liga Principal', division: 1, seasonId: 's1', clubIds: clubs.map(c => c.id) },
];

export const seasons: Season[] = [
  { id: 's1', leagueId: 'l1', number: 1, phase: 'regular', currentRound: 8, totalRounds: 30 },
];

export const standings: LeagueStanding[] = [
  { clubId: 'c1', played: 7, won: 5, drawn: 1, lost: 1, goalsFor: 14, goalsAgainst: 6, goalDifference: 8, points: 16, form: ['W','W','D','W','L'] },
  { clubId: 'c4', played: 7, won: 4, drawn: 2, lost: 1, goalsFor: 11, goalsAgainst: 5, goalDifference: 6, points: 14, form: ['W','D','W','W','D'] },
  { clubId: 'c2', played: 7, won: 4, drawn: 1, lost: 2, goalsFor: 12, goalsAgainst: 8, goalDifference: 4, points: 13, form: ['L','W','W','D','W'] },
  { clubId: 'c3', played: 7, won: 3, drawn: 2, lost: 2, goalsFor: 9, goalsAgainst: 7, goalDifference: 2, points: 11, form: ['W','L','D','W','D'] },
  { clubId: 'c5', played: 7, won: 2, drawn: 1, lost: 4, goalsFor: 7, goalsAgainst: 11, goalDifference: -4, points: 7, form: ['L','L','W','L','D'] },
  { clubId: 'c6', played: 7, won: 0, drawn: 3, lost: 4, goalsFor: 4, goalsAgainst: 12, goalDifference: -8, points: 3, form: ['D','L','L','D','L'] },
];

// ===== Matches =====
export const matches: Match[] = [
  { id: 'm1', leagueId: 'l1', seasonId: 's1', round: 8, homeClubId: 'c1', awayClubId: 'c2', homeScore: 0, awayScore: 0, status: 'scheduled', date: '2025-03-20T19:00:00Z' },
  { id: 'm2', leagueId: 'l1', seasonId: 's1', round: 8, homeClubId: 'c3', awayClubId: 'c4', homeScore: 0, awayScore: 0, status: 'scheduled', date: '2025-03-20T19:00:00Z' },
  { id: 'm3', leagueId: 'l1', seasonId: 's1', round: 8, homeClubId: 'c5', awayClubId: 'c6', homeScore: 0, awayScore: 0, status: 'scheduled', date: '2025-03-20T19:00:00Z' },
  { id: 'm4', leagueId: 'l1', seasonId: 's1', round: 7, homeClubId: 'c1', awayClubId: 'c3', homeScore: 2, awayScore: 1, status: 'finished', date: '2025-03-13T19:00:00Z' },
  { id: 'm5', leagueId: 'l1', seasonId: 's1', round: 7, homeClubId: 'c4', awayClubId: 'c5', homeScore: 3, awayScore: 0, status: 'finished', date: '2025-03-13T19:00:00Z' },
];

// ===== Tactics =====
export const tactics: Tactic[] = [
  {
    id: 't1', clubId: 'c1', formation: '4-3-3', style: 'possession',
    instructions: { width: 7, defensiveLine: 6, pressingIntensity: 7, tempo: 6, lateralFocus: 'balanced', longBalls: false, recomposition: 6, aerialDuels: 4, markingPriority: 'zonal' },
  },
];

// ===== Notifications =====
export const notifications: Notification[] = [
  { id: 'n1', userId: 'u1', title: 'Próxima Partida', message: 'Atlético Ferro vs Estrela do Sul — Rodada 8, amanhã às 19h.', read: false, createdAt: '2025-03-19T10:00:00Z', type: 'match' },
  { id: 'n2', userId: 'u1', title: 'Treino Disponível', message: 'Sessão de treino técnico liberada. Recupere energia antes.', read: false, createdAt: '2025-03-18T14:00:00Z', type: 'training' },
  { id: 'n3', userId: 'u1', title: 'Contrato', message: 'Seu contrato com Atlético Ferro vence em 32 semanas.', read: true, createdAt: '2025-03-15T09:00:00Z', type: 'contract' },
];

// ===== Helpers =====
export const getClub = (id: string) => clubs.find(c => c.id === id);
export const getPlayer = (id: string) => players.find(p => p.id === id);
export const getPlayersByClub = (clubId: string) => players.filter(p => p.clubId === clubId);
