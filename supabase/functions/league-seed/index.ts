import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Brazilian team name generator ──────────────────────────
const TEAM_NAMES = [
  { name: 'Estrela FC', short: 'EST', city: 'São Paulo' },
  { name: 'Tubarão SC', short: 'TUB', city: 'Santos' },
  { name: 'Falcão EC', short: 'FAL', city: 'Rio de Janeiro' },
  { name: 'Leões da Serra', short: 'LEO', city: 'Curitiba' },
  { name: 'Guaraná AC', short: 'GUA', city: 'Manaus' },
  { name: 'Trovão FC', short: 'TRO', city: 'Belo Horizonte' },
  { name: 'Águia Dourada', short: 'AGD', city: 'Brasília' },
  { name: 'Maré FC', short: 'MAR', city: 'Salvador' },
  { name: 'Fênix EC', short: 'FEN', city: 'Recife' },
  { name: 'Dragão Azul', short: 'DRA', city: 'Porto Alegre' },
  { name: 'Pantera SC', short: 'PAN', city: 'Fortaleza' },
  { name: 'Ventania FC', short: 'VEN', city: 'Goiânia' },
  { name: 'Lobo Bravo', short: 'LOB', city: 'Campinas' },
  { name: 'Raio FC', short: 'RAI', city: 'Florianópolis' },
  { name: 'Titã EC', short: 'TIT', city: 'Belém' },
  { name: 'Cobra Real', short: 'COB', city: 'Vitória' },
  { name: 'Vulcão SC', short: 'VUL', city: 'Natal' },
  { name: 'Cometa FC', short: 'COM', city: 'Cuiabá' },
  { name: 'Jaguar AC', short: 'JAG', city: 'Maceió' },
  { name: 'Tsunami EC', short: 'TSU', city: 'João Pessoa' },
];

const STADIUM_NAMES = [
  'Arena do Povo', 'Estádio Municipal', 'Arena Central', 'Estádio da Vitória',
  'Arena do Norte', 'Estádio Gigante', 'Arena Sol', 'Estádio da Paz',
  'Arena Tropical', 'Estádio Imperial', 'Arena Raio', 'Estádio Novo',
  'Arena Ouro', 'Estádio do Mar', 'Arena da Selva', 'Estádio Real',
  'Arena Fogo', 'Estádio da Serra', 'Arena Brasa', 'Estádio do Vale',
];

const COLORS = [
  { primary: '#FF0000', secondary: '#FFFFFF' },
  { primary: '#0000FF', secondary: '#FFFFFF' },
  { primary: '#008000', secondary: '#FFFFFF' },
  { primary: '#FFD700', secondary: '#000000' },
  { primary: '#800080', secondary: '#FFFFFF' },
  { primary: '#FF4500', secondary: '#000000' },
  { primary: '#00CED1', secondary: '#000000' },
  { primary: '#DC143C', secondary: '#FFD700' },
  { primary: '#006400', secondary: '#FFD700' },
  { primary: '#191970', secondary: '#FF6347' },
  { primary: '#8B0000', secondary: '#FFFFFF' },
  { primary: '#2F4F4F', secondary: '#00FA9A' },
  { primary: '#FF1493', secondary: '#000000' },
  { primary: '#1E90FF', secondary: '#FFFFFF' },
  { primary: '#B8860B', secondary: '#000000' },
  { primary: '#4B0082', secondary: '#FFD700' },
  { primary: '#228B22', secondary: '#FF4500' },
  { primary: '#CD853F', secondary: '#FFFFFF' },
  { primary: '#483D8B', secondary: '#00FF7F' },
  { primary: '#708090', secondary: '#FF6347' },
];

// 22 bot player positions
const BOT_POSITIONS = [
  'GK', 'GK',
  'CB', 'CB', 'CB', 'CB', 'LB', 'RB',
  'CDM', 'CDM', 'CM', 'CM', 'LM', 'RM',
  'CAM', 'CAM',
  'LW', 'RW',
  'ST', 'ST', 'CF', 'CF',
];

// Formation 4-4-2 starting positions for 11 starters
const STARTER_POSITIONS_HOME = [
  { pos: 'GK', x: 5, y: 50 },
  { pos: 'CB', x: 20, y: 30 },
  { pos: 'CB', x: 20, y: 50 },
  { pos: 'LB', x: 20, y: 15 },
  { pos: 'RB', x: 20, y: 85 },
  { pos: 'CDM', x: 35, y: 35 },
  { pos: 'CM', x: 35, y: 65 },
  { pos: 'LM', x: 50, y: 15 },
  { pos: 'RM', x: 50, y: 85 },
  { pos: 'ST', x: 65, y: 40 },
  { pos: 'CF', x: 65, y: 60 },
];

function generateBotName(): string {
  const firstNames = [
    'Lucas', 'Gabriel', 'Rafael', 'Matheus', 'Bruno', 'Felipe', 'Diego', 'Thiago',
    'André', 'Carlos', 'Pedro', 'João', 'Marcos', 'Rodrigo', 'Gustavo', 'Henrique',
    'Leonardo', 'Vinícius', 'Kaique', 'Davi', 'Eduardo', 'Daniel', 'Caio', 'Igor',
    'Renato', 'Fábio', 'Alex', 'Leandro', 'Hugo', 'Murilo', 'Yago', 'Breno',
    'Samuel', 'Nathan', 'Enzo', 'Bernardo', 'Arthur', 'Ryan', 'Nicolas', 'Heitor',
  ];
  const lastNames = [
    'Silva', 'Santos', 'Oliveira', 'Souza', 'Pereira', 'Costa', 'Rodrigues',
    'Almeida', 'Nascimento', 'Lima', 'Araújo', 'Fernandes', 'Carvalho', 'Gomes',
    'Martins', 'Rocha', 'Ribeiro', 'Barros', 'Freitas', 'Moreira', 'Mendes',
    'Teixeira', 'Correia', 'Vieira', 'Monteiro', 'Cardoso', 'Melo', 'Pinto',
  ];
  return `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`;
}

function generateAge(position: string): number {
  // GKs tend to be older, attackers younger
  if (position === 'GK') return 25 + Math.floor(Math.random() * 10);
  if (['ST', 'CF', 'LW', 'RW'].includes(position)) return 20 + Math.floor(Math.random() * 8);
  return 22 + Math.floor(Math.random() * 8);
}

// ─── Round-robin scheduling (circle method) ─────────────────
function generateRoundRobin(teamIds: string[]): { round: number; home: string; away: string }[] {
  const n = teamIds.length;
  const rounds: { round: number; home: string; away: string }[] = [];
  const teams = [...teamIds];

  // If odd number of teams, add a bye
  if (n % 2 !== 0) teams.push('BYE');
  const half = teams.length / 2;

  for (let round = 0; round < teams.length - 1; round++) {
    for (let i = 0; i < half; i++) {
      const home = teams[i];
      const away = teams[teams.length - 1 - i];
      if (home === 'BYE' || away === 'BYE') continue;
      // Alternate home/away by round
      if (round % 2 === 0) {
        rounds.push({ round: round + 1, home, away });
      } else {
        rounds.push({ round: round + 1, home: away, away: home });
      }
    }
    // Rotate: fix first element, rotate the rest
    const last = teams.pop()!;
    teams.splice(1, 0, last);
  }

  return rounds;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const { action } = body;

    if (action === 'seed_league') {
      // ── Step 1: Create the league ──
      const { data: league, error: leagueError } = await supabase.from('leagues').insert({
        name: 'Liga Brasileira - Série A',
        country: 'BR',
        division: 1,
        max_teams: 20,
        status: 'active',
      }).select('id').single();

      if (leagueError) throw new Error(`Failed to create league: ${leagueError.message}`);
      const leagueId = league.id;

      // ── Step 2: Find existing clubs and add them to the league ──
      const { data: existingClubs } = await supabase
        .from('clubs')
        .select('id, manager_profile_id, name')
        .eq('status', 'active')
        .is('league_id', null);

      const existingClubIds: string[] = [];
      for (const club of (existingClubs || [])) {
        await supabase.from('clubs').update({
          league_id: leagueId,
          is_bot_managed: false,
        }).eq('id', club.id);
        existingClubIds.push(club.id);

        // Ensure existing clubs have facilities
        const { data: existingFacilities } = await supabase
          .from('club_facilities')
          .select('facility_type')
          .eq('club_id', club.id);

        const existingTypes = new Set((existingFacilities || []).map(f => f.facility_type));
        const missingFacilities = ['souvenir_shop', 'sponsorship', 'training_center', 'stadium']
          .filter(t => !existingTypes.has(t))
          .map(t => ({ club_id: club.id, facility_type: t, level: 1 }));

        if (missingFacilities.length > 0) {
          await supabase.from('club_facilities').insert(missingFacilities);
        }

        console.log(`[SEED] Added existing club "${club.name}" to league`);
      }

      // ── Step 3: Generate bot clubs to fill to 20 ──
      const botsNeeded = 20 - existingClubIds.length;
      const usedNames = new Set((existingClubs || []).map(c => c.name));
      const availableTeams = TEAM_NAMES.filter(t => !usedNames.has(t.name));
      const botClubIds: string[] = [];

      for (let i = 0; i < botsNeeded && i < availableTeams.length; i++) {
        const team = availableTeams[i];
        const colors = COLORS[i % COLORS.length];
        const stadiumName = STADIUM_NAMES[i % STADIUM_NAMES.length];

        // Create a dummy manager_profile for the bot club
        const { data: botManager } = await supabase.from('manager_profiles').insert({
          user_id: null,
          full_name: `Bot Manager ${team.short}`,
          reputation: 20,
          money: 0,
          coach_type: 'all_around',
        }).select('id').single();

        if (!botManager) continue;

        // Create club
        const { data: club } = await supabase.from('clubs').insert({
          manager_profile_id: botManager.id,
          name: team.name,
          short_name: team.short,
          primary_color: colors.primary,
          secondary_color: colors.secondary,
          city: team.city,
          reputation: 20,
          status: 'active',
          league_id: leagueId,
          is_bot_managed: true,
        }).select('id').single();

        if (!club) continue;
        botClubIds.push(club.id);

        // Create club finances
        await supabase.from('club_finances').insert({
          club_id: club.id,
          balance: 200000,
          weekly_wage_bill: 5500, // 22 * 250
          projected_income: 12000,
          projected_expense: 4000,
        });

        // Create facilities (all level 1)
        await supabase.from('club_facilities').insert([
          { club_id: club.id, facility_type: 'souvenir_shop', level: 1 },
          { club_id: club.id, facility_type: 'sponsorship', level: 1 },
          { club_id: club.id, facility_type: 'training_center', level: 1 },
          { club_id: club.id, facility_type: 'stadium', level: 1 },
        ]);

        // Create stadium
        await supabase.from('stadiums').insert({
          club_id: club.id,
          name: stadiumName,
          capacity: 5000,
          quality: 30,
          prestige: 15,
          maintenance_cost: 2000,
        });

        // Create club settings
        await supabase.from('club_settings').insert({
          club_id: club.id,
          default_formation: '4-4-2',
          play_style: 'balanced',
        });

        // Create 22 bot players
        const playerInserts: any[] = [];
        for (let j = 0; j < BOT_POSITIONS.length; j++) {
          const pos = BOT_POSITIONS[j];
          playerInserts.push({
            club_id: club.id,
            full_name: generateBotName(),
            age: generateAge(pos),
            height: 170 + Math.floor(Math.random() * 20),
            dominant_foot: Math.random() > 0.3 ? 'right' : 'left',
            primary_position: pos,
            secondary_position: null,
            archetype: 'balanced',
            overall: 50,
            reputation: 20,
            money: 0,
            weekly_salary: 250,
            energy_current: 100,
            energy_max: 100,
          });
        }

        const { data: players } = await supabase
          .from('player_profiles')
          .insert(playerInserts)
          .select('id, primary_position');

        if (!players) continue;

        // Create player attributes (all 50)
        const attrInserts = players.map((p: any) => ({
          player_profile_id: p.id,
          aceleracao: 50, acuracia_chute: 50, agilidade: 50, antecipacao: 50,
          cabeceio: 50, comando_area: 50, controle_bola: 50, coragem: 50,
          curva: 50, defesa_aerea: 50, desarme: 50, distribuicao_curta: 50,
          distribuicao_longa: 50, drible: 50, equilibrio: 50, forca: 50,
          forca_chute: 50, marcacao: 50, passe_alto: 50, passe_baixo: 50,
          pegada: 50, posicionamento_defensivo: 50, posicionamento_gol: 50,
          posicionamento_ofensivo: 50, pulo: 50, reflexo: 50, resistencia: 50,
          saida_gol: 50, stamina: 50, tempo_reacao: 50, tomada_decisao: 50,
          trabalho_equipe: 50, um_contra_um: 50, um_toque: 50, velocidade: 50,
          visao_jogo: 50,
        }));
        await supabase.from('player_attributes').insert(attrInserts);

        // Create contracts (R$250/week for all bots)
        const contractInserts = players.map((p: any) => ({
          player_profile_id: p.id,
          club_id: club.id,
          weekly_salary: 250,
          release_clause: 2500,
          start_date: new Date().toISOString(),
          end_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'active',
        }));
        await supabase.from('contracts').insert(contractInserts);

        // Create lineup with 11 starters
        const { data: lineup } = await supabase.from('lineups').insert({
          club_id: club.id,
          name: 'Titular',
          formation: '4-4-2',
          is_active: true,
        }).select('id').single();

        if (lineup) {
          const starterSlots = STARTER_POSITIONS_HOME.map((sp, idx) => {
            const player = players.find((p: any) => p.primary_position === sp.pos);
            // Find unused player for this position
            const usedPlayerIds = new Set<string>();
            const matchingPlayers = players.filter((p: any) => p.primary_position === sp.pos);
            let selectedPlayer = matchingPlayers.find((p: any) => !usedPlayerIds.has(p.id));
            if (selectedPlayer) usedPlayerIds.add(selectedPlayer.id);
            return {
              lineup_id: lineup.id,
              player_profile_id: selectedPlayer?.id || players[idx]?.id,
              slot_position: sp.pos,
              role_type: 'starter',
              sort_order: idx + 1,
            };
          });

          // Deduplicate — ensure no player is in two slots
          const usedIds = new Set<string>();
          const dedupedSlots: any[] = [];
          for (const slot of starterSlots) {
            if (usedIds.has(slot.player_profile_id)) {
              // Find another player with same position not yet used
              const alt = players.find((p: any) =>
                p.primary_position === slot.slot_position && !usedIds.has(p.id)
              ) || players.find((p: any) => !usedIds.has(p.id));
              if (alt) {
                slot.player_profile_id = alt.id;
              }
            }
            usedIds.add(slot.player_profile_id);
            dedupedSlots.push(slot);
          }

          await supabase.from('lineup_slots').insert(dedupedSlots);
        }

        console.log(`[SEED] Created bot club "${team.name}" with 22 players`);
      }

      // ── Step 4: Create season 1 ──
      const allClubIds = [...existingClubIds, ...botClubIds];

      const { data: season } = await supabase.from('league_seasons').insert({
        league_id: leagueId,
        season_number: 1,
        status: 'scheduled',
      }).select('id').single();

      if (!season) throw new Error('Failed to create season');

      // Create standings for all clubs
      const standingsInserts = allClubIds.map(clubId => ({
        season_id: season.id,
        club_id: clubId,
      }));
      await supabase.from('league_standings').insert(standingsInserts);

      // ── Step 5: Generate round-robin schedule ──
      const fixtures = generateRoundRobin(allClubIds);

      // Schedule: 2 games per week (Wed + Sun at 21h BRT)
      // First game: next Wednesday
      const now = new Date();
      const startDate = new Date(body.start_date || now.toISOString());

      // Find next Wednesday from startDate
      const dayOfWeek = startDate.getUTCDay();
      const daysUntilWed = (3 - dayOfWeek + 7) % 7 || 7;
      const firstWednesday = new Date(startDate);
      firstWednesday.setUTCDate(firstWednesday.getUTCDate() + daysUntilWed);
      firstWednesday.setUTCHours(24, 0, 0, 0); // 21h BRT = 00h UTC next day

      // Group fixtures by round
      const roundFixtures = new Map<number, { home: string; away: string }[]>();
      for (const f of fixtures) {
        if (!roundFixtures.has(f.round)) roundFixtures.set(f.round, []);
        roundFixtures.get(f.round)!.push({ home: f.home, away: f.away });
      }

      // Assign dates: odd rounds on Wednesday, even rounds on Sunday
      let currentWed = new Date(firstWednesday);

      for (let roundNum = 1; roundNum <= roundFixtures.size; roundNum++) {
        const isOddRound = roundNum % 2 === 1;
        let roundDate: Date;

        if (isOddRound) {
          roundDate = new Date(currentWed);
        } else {
          // Sunday = Wed + 4 days
          roundDate = new Date(currentWed);
          roundDate.setUTCDate(roundDate.getUTCDate() + 4);
        }

        // After even round, advance to next Wednesday
        if (!isOddRound) {
          currentWed.setUTCDate(currentWed.getUTCDate() + 7);
        }

        const { data: round } = await supabase.from('league_rounds').insert({
          season_id: season.id,
          round_number: roundNum,
          scheduled_at: roundDate.toISOString(),
          status: 'scheduled',
        }).select('id').single();

        if (!round) continue;

        const matchFixtures = roundFixtures.get(roundNum) || [];
        for (const fixture of matchFixtures) {
          // Create the actual match
          const { data: match } = await supabase.from('matches').insert({
            home_club_id: fixture.home,
            away_club_id: fixture.away,
            scheduled_at: roundDate.toISOString(),
            status: 'scheduled',
          }).select('id').single();

          // Link to league_matches
          await supabase.from('league_matches').insert({
            round_id: round.id,
            match_id: match?.id || null,
            home_club_id: fixture.home,
            away_club_id: fixture.away,
          });
        }

        console.log(`[SEED] Round ${roundNum} scheduled at ${roundDate.toISOString()} with ${matchFixtures.length} matches`);
      }

      return new Response(JSON.stringify({
        status: 'seeded',
        league_id: leagueId,
        season_id: season.id,
        existing_clubs: existingClubIds.length,
        bot_clubs_created: botClubIds.length,
        total_rounds: roundFixtures.size,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Unknown action. Use: seed_league' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[SEED ERROR]', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
