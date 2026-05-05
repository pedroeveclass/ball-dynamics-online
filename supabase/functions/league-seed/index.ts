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

// Second-tier team names — distinct from TEAM_NAMES so a Série B seed
// doesn't collide with Série A clubs in the same DB.
const TEAM_NAMES_SERIE_B = [
  { name: 'Estrela do Sul', short: 'EDS', city: 'Pelotas' },
  { name: 'Real Esporte', short: 'REA', city: 'Rio Grande' },
  { name: 'Aliança SC', short: 'ALI', city: 'Londrina' },
  { name: 'Trovão Negro', short: 'TVN', city: 'Manaus' },
  { name: 'Galo Carijó', short: 'GAC', city: 'Anápolis' },
  { name: 'Cruzeiro do Vale', short: 'CDV', city: 'Caxias do Sul' },
  { name: 'União Atlético', short: 'UAT', city: 'São Luís' },
  { name: 'Furacão Brasil', short: 'FBR', city: 'Joinville' },
  { name: 'Brasa FC', short: 'BRA', city: 'Aracaju' },
  { name: 'Centauro EC', short: 'CEN', city: 'Teresina' },
  { name: 'Sereia FC', short: 'SER', city: 'Olinda' },
  { name: 'Apolo Esporte', short: 'APO', city: 'Boa Vista' },
  { name: 'Olimpo SC', short: 'OLI', city: 'Palmas' },
  { name: 'Atlas FC', short: 'ATL', city: 'Porto Velho' },
  { name: 'Verdão de Aço', short: 'VDA', city: 'Volta Redonda' },
  { name: 'Independente AC', short: 'IND', city: 'Feira de Santana' },
  { name: 'Marquês AC', short: 'MAQ', city: 'Cuiabá' },
  { name: 'Império EC', short: 'IMP', city: 'Campo Grande' },
  { name: 'Comercial FC', short: 'COE', city: 'Ribeirão Preto' },
  { name: 'Bandeirantes SC', short: 'BAN', city: 'São José do Rio Preto' },
];

// Lower-tier pool for divisions 3+. 60 entries — supports 3 more
// divisions without reuse. The seed picks the first 20 not already
// taken by any existing club.
const TEAM_NAMES_LOWER_TIERS = [
  { name: 'Sertão SC', short: 'SER', city: 'Petrolina' },
  { name: 'Pampas FC', short: 'PAM', city: 'Bagé' },
  { name: 'Carcará EC', short: 'CAR', city: 'Crato' },
  { name: 'Mandacaru AC', short: 'MND', city: 'Juazeiro' },
  { name: 'Caatinga FC', short: 'CTG', city: 'Mossoró' },
  { name: 'Litoral SC', short: 'LIT', city: 'Praia Grande' },
  { name: 'Cerrado EC', short: 'CER', city: 'Anápolis' },
  { name: 'Mata Atlântica FC', short: 'MAT', city: 'Linhares' },
  { name: 'Pantanal SC', short: 'PNT', city: 'Corumbá' },
  { name: 'Amazônia FC', short: 'AMZ', city: 'Santarém' },
  { name: 'Boiadeiro EC', short: 'BOI', city: 'Barretos' },
  { name: 'Tropeiros AC', short: 'TRP', city: 'Lages' },
  { name: 'Bandeirante FC', short: 'BND', city: 'Sorocaba' },
  { name: 'Sambaqui SC', short: 'SAM', city: 'Itanhaém' },
  { name: 'Coqueiral FC', short: 'COQ', city: 'Maragogi' },
  { name: 'Ipanema EC', short: 'IPA', city: 'Niterói' },
  { name: 'Capivara AC', short: 'CAP', city: 'Pelotas' },
  { name: 'Serrano FC', short: 'SRR', city: 'Petrópolis' },
  { name: 'Vale do Sol SC', short: 'VDS', city: 'Caldas Novas' },
  { name: 'Estrela Polar FC', short: 'EPO', city: 'Macapá' },
  { name: 'Bordeira EC', short: 'BRD', city: 'São José dos Campos' },
  { name: 'Caçador AC', short: 'CAÇ', city: 'Caçador' },
  { name: 'Iguaçu FC', short: 'IGU', city: 'Foz do Iguaçu' },
  { name: 'Capão Redondo SC', short: 'CRD', city: 'Capão Redondo' },
  { name: 'Lampião EC', short: 'LMP', city: 'Sergipe' },
  { name: 'Pororoca FC', short: 'PRR', city: 'Macapá' },
  { name: 'Riacho AC', short: 'RIA', city: 'Brasília' },
  { name: 'Castanheira SC', short: 'CTN', city: 'Castanhal' },
  { name: 'Buritizal FC', short: 'BUR', city: 'Buritizal' },
  { name: 'Caboclo EC', short: 'CBC', city: 'Manacapuru' },
  { name: 'Maracá AC', short: 'MRC', city: 'Boa Vista' },
  { name: 'Garra Brasileira', short: 'GRR', city: 'Várzea Grande' },
  { name: 'Sol Nascente FC', short: 'SNS', city: 'Águas Claras' },
  { name: 'Praia Mole SC', short: 'PML', city: 'Florianópolis' },
  { name: 'Rio Verde EC', short: 'RVE', city: 'Rio Verde' },
  { name: 'Cachoeira AC', short: 'CCH', city: 'Cachoeira do Sul' },
  { name: 'Farol FC', short: 'FRL', city: 'Aracati' },
  { name: 'Itacaré SC', short: 'ITA', city: 'Itacaré' },
  { name: 'Pão de Açúcar EC', short: 'PDA', city: 'Pão de Açúcar' },
  { name: 'Mariri FC', short: 'MAR', city: 'Mariri' },
  { name: 'Tapajós AC', short: 'TPJ', city: 'Itaituba' },
  { name: 'Solimões SC', short: 'SOL', city: 'Tabatinga' },
  { name: 'Catu FC', short: 'CAT', city: 'Catu' },
  { name: 'Brejo EC', short: 'BRJ', city: 'Brejo da Madre de Deus' },
  { name: 'Alto Paraíso AC', short: 'APR', city: 'Alto Paraíso' },
  { name: 'Tocantins FC', short: 'TOC', city: 'Palmas' },
  { name: 'Aroeira SC', short: 'ARO', city: 'Cuiabá' },
  { name: 'Capim Dourado EC', short: 'CDO', city: 'Palmas' },
  { name: 'Riobaldo FC', short: 'RBD', city: 'Itamarandiba' },
  { name: 'Manga Rosa AC', short: 'MGR', city: 'Manga' },
  { name: 'Recife do Norte SC', short: 'RDN', city: 'Recife' },
  { name: 'Boitatá FC', short: 'BTT', city: 'Iguape' },
  { name: 'Curupira EC', short: 'CRP', city: 'Tefé' },
  { name: 'Saci AC', short: 'SAC', city: 'Lapa' },
  { name: 'Iara SC', short: 'IAR', city: 'Iguatu' },
  { name: 'Gralha Azul FC', short: 'GAZ', city: 'Curitiba' },
  { name: 'Buriti AC', short: 'BTI', city: 'Boa Vista' },
  { name: 'Aroeira do Vale SC', short: 'AVL', city: 'Vale do Aroeira' },
  { name: 'Caiçara FC', short: 'CIC', city: 'Cananéia' },
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

  // Authorize cron/admin access — accepts CRON_SECRET header or service_role JWT.
  // Decode the bearer and accept any role=service_role so a rotated service
  // key doesn't silently break the cron hardcoded JWT.
  const cronSecret = Deno.env.get('CRON_SECRET');
  const serviceRoleKey = Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authHeader = req.headers.get('Authorization')?.replace('Bearer ', '');
  const hasCronSecret = cronSecret && req.headers.get('x-cron-secret') === cronSecret;

  let hasServiceRole = !!(serviceRoleKey && authHeader === serviceRoleKey);
  if (!hasServiceRole && authHeader) {
    try {
      const parts = authHeader.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        if (payload?.role === 'service_role') hasServiceRole = true;
      }
    } catch { /* malformed token */ }
  }

  if (!hasCronSecret && !hasServiceRole) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const { action } = body;

    // Validate start_date is a valid date when provided
    if (body.start_date) {
      const parsed = new Date(body.start_date);
      if (isNaN(parsed.getTime())) {
        return new Response(JSON.stringify({ error: 'Invalid start_date format, expected ISO date string' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

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
          // Match row will be materialized 5 min before kickoff by league-scheduler cron
          await supabase.from('league_matches').insert({
            round_id: round.id,
            match_id: null,
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

    // ────────────────────────────────────────────────────────────
    // regenerate_season_fixtures — rebuild league_matches for an existing
    // season using its current standings (which is the authoritative
    // club list). Keeps league_rounds intact (their dates are sticky).
    // Used after admin_move_club_to_league wipes fixtures.
    // ────────────────────────────────────────────────────────────
    if (action === 'regenerate_season_fixtures') {
      const seasonId: string | undefined = body.season_id;
      if (!seasonId) {
        return new Response(JSON.stringify({ error: 'season_id required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: standings } = await supabase
        .from('league_standings')
        .select('club_id')
        .eq('season_id', seasonId);
      const clubIds = (standings ?? []).map((s: any) => s.club_id);
      if (clubIds.length < 2) {
        return new Response(JSON.stringify({ error: `season has ${clubIds.length} clubs in standings` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: rounds } = await supabase
        .from('league_rounds')
        .select('id, round_number')
        .eq('season_id', seasonId)
        .order('round_number', { ascending: true });
      const roundsList = (rounds ?? []) as Array<{ id: string; round_number: number }>;
      if (roundsList.length === 0) {
        return new Response(JSON.stringify({ error: 'no rounds in season' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Wipe any leftover league_matches under those rounds and regenerate.
      await supabase.from('league_matches').delete().in('round_id', roundsList.map(r => r.id));

      const fixtures = generateRoundRobin(clubIds);
      const byRound = new Map<number, { home: string; away: string }[]>();
      for (const f of fixtures) {
        if (!byRound.has(f.round)) byRound.set(f.round, []);
        byRound.get(f.round)!.push({ home: f.home, away: f.away });
      }

      let inserted = 0;
      for (const r of roundsList) {
        const fxs = byRound.get(r.round_number) ?? [];
        if (fxs.length === 0) continue;
        const rows = fxs.map(fx => ({
          round_id: r.id, match_id: null,
          home_club_id: fx.home, away_club_id: fx.away,
        }));
        const { error } = await supabase.from('league_matches').insert(rows);
        if (!error) inserted += rows.length;
      }

      return new Response(JSON.stringify({
        status: 'rebuilt',
        season_id: seasonId,
        clubs: clubIds.length,
        rounds: roundsList.length,
        matches_inserted: inserted,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ────────────────────────────────────────────────────────────
    // seed_division — generic division creation. Caller passes:
    //   - country (BR, EN, ES, ...)
    //   - league_name (display name)
    //   - division (integer; 1=Série A, 2=B, 3=C, ...)
    //   - clubs (default 20)
    //   - overall (default by tier: 50/45/40/35/30)
    //   - balance (default by tier: 200k/150k/100k/75k/50k)
    // Carrega todos os pools de bot-clubs (Série A + B + tier inferior),
    // filtra os já tomados, escolhe `clubs` distintos.
    // ────────────────────────────────────────────────────────────
    if (action === 'seed_division') {
      const country = (body.country ?? 'BR').toUpperCase();
      const leagueName = (body.league_name ?? '').trim();
      const division = parseInt(body.division ?? '0');
      const clubsCount = parseInt(body.clubs ?? '20');

      if (!leagueName || !Number.isInteger(division) || division < 1) {
        return new Response(JSON.stringify({ error: 'league_name + division (>=1) required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (!Number.isInteger(clubsCount) || clubsCount < 4 || clubsCount > 30) {
        return new Response(JSON.stringify({ error: 'clubs must be between 4 and 30' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Idempotency: same name OR same country+division can't repeat.
      const { data: existingByName } = await supabase
        .from('leagues').select('id').eq('name', leagueName).maybeSingle();
      if (existingByName) {
        return new Response(JSON.stringify({
          status: 'skipped', reason: 'name_taken', league_id: existingByName.id,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const { data: existingByDiv } = await supabase
        .from('leagues').select('id, name').eq('country', country).eq('division', division).maybeSingle();
      if (existingByDiv) {
        return new Response(JSON.stringify({
          status: 'skipped', reason: 'division_taken', existing_name: existingByDiv.name,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Tier-based defaults — division 1 is strongest (rating 50, R$200k)
      // and each step down weakens. Caller can override with explicit
      // body.overall / body.balance.
      const tier = Math.min(5, division);
      const defaultOverall = [50, 45, 40, 35, 30][tier - 1];
      const defaultBalance = [200000, 150000, 100000, 75000, 50000][tier - 1];
      const defaultRep = [20, 15, 10, 8, 5][tier - 1];
      const defaultSalary = [250, 200, 150, 120, 100][tier - 1];
      const playerOverall = parseInt(body.overall ?? defaultOverall.toString());
      const startBalance = parseInt(body.balance ?? defaultBalance.toString());

      const { data: league, error: leagueError } = await supabase.from('leagues').insert({
        name: leagueName, country, division, max_teams: clubsCount, status: 'active',
      }).select('id').single();
      if (leagueError || !league) {
        return new Response(JSON.stringify({ error: `Failed to create league: ${leagueError?.message}` }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const leagueId = league.id;

      // Pull every existing club name to avoid collisions.
      const { data: allClubs } = await supabase.from('clubs').select('name');
      const usedNames = new Set((allClubs ?? []).map((c: any) => c.name));
      // Pool order: tier-appropriate first, then fall back to other pools.
      const pool = division === 1
        ? [...TEAM_NAMES, ...TEAM_NAMES_SERIE_B, ...TEAM_NAMES_LOWER_TIERS]
        : division === 2
          ? [...TEAM_NAMES_SERIE_B, ...TEAM_NAMES_LOWER_TIERS, ...TEAM_NAMES]
          : [...TEAM_NAMES_LOWER_TIERS, ...TEAM_NAMES_SERIE_B, ...TEAM_NAMES];
      const availableTeams = pool.filter(t => !usedNames.has(t.name)).slice(0, clubsCount);
      if (availableTeams.length < clubsCount) {
        return new Response(JSON.stringify({
          error: `Pool exhausted: needed ${clubsCount}, found ${availableTeams.length} unused names. Add more entries to TEAM_NAMES_LOWER_TIERS.`,
        }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const botClubIds: string[] = [];
      for (let i = 0; i < availableTeams.length; i++) {
        const team = availableTeams[i];
        const colors = COLORS[i % COLORS.length];
        const stadiumName = STADIUM_NAMES[i % STADIUM_NAMES.length];

        const { data: botManager } = await supabase.from('manager_profiles').insert({
          user_id: null, full_name: `Bot Manager ${team.short}`,
          reputation: defaultRep, money: 0, coach_type: 'all_around',
        }).select('id').single();
        if (!botManager) continue;

        const { data: club } = await supabase.from('clubs').insert({
          manager_profile_id: botManager.id, name: team.name, short_name: team.short,
          primary_color: colors.primary, secondary_color: colors.secondary,
          city: team.city, reputation: defaultRep, status: 'active',
          league_id: leagueId, is_bot_managed: true,
        }).select('id').single();
        if (!club) continue;
        botClubIds.push(club.id);

        await supabase.from('club_finances').insert({
          club_id: club.id, balance: startBalance,
          weekly_wage_bill: defaultSalary * 22,
          projected_income: Math.round(startBalance * 0.06),
          projected_expense: Math.round(startBalance * 0.025),
        });

        await supabase.from('club_facilities').insert([
          { club_id: club.id, facility_type: 'souvenir_shop', level: 1 },
          { club_id: club.id, facility_type: 'sponsorship', level: 1 },
          { club_id: club.id, facility_type: 'training_center', level: 1 },
          { club_id: club.id, facility_type: 'stadium', level: 1 },
        ]);

        await supabase.from('stadiums').insert({
          club_id: club.id, name: stadiumName,
          capacity: Math.max(2000, 5000 - (division - 1) * 1000),
          quality: Math.max(15, 30 - (division - 1) * 5),
          prestige: Math.max(5, 15 - (division - 1) * 3),
          maintenance_cost: Math.max(800, 2000 - (division - 1) * 400),
        });

        await supabase.from('club_settings').insert({
          club_id: club.id, default_formation: '4-4-2', play_style: 'balanced',
        });

        const playerInserts: any[] = [];
        for (let j = 0; j < BOT_POSITIONS.length; j++) {
          playerInserts.push({
            club_id: club.id, full_name: generateBotName(),
            age: generateAge(BOT_POSITIONS[j]),
            height: 170 + Math.floor(Math.random() * 20),
            dominant_foot: Math.random() > 0.3 ? 'right' : 'left',
            primary_position: BOT_POSITIONS[j], secondary_position: null,
            archetype: 'balanced', overall: playerOverall, reputation: defaultRep,
            money: 0, weekly_salary: defaultSalary,
            energy_current: 100, energy_max: 100,
          });
        }
        const { data: players } = await supabase.from('player_profiles').insert(playerInserts).select('id, primary_position');
        if (!players) continue;

        const attrInserts = players.map((p: any) => ({
          player_profile_id: p.id,
          aceleracao: playerOverall, acuracia_chute: playerOverall, agilidade: playerOverall, antecipacao: playerOverall,
          cabeceio: playerOverall, comando_area: playerOverall, controle_bola: playerOverall, coragem: playerOverall,
          curva: playerOverall, defesa_aerea: playerOverall, desarme: playerOverall, distribuicao_curta: playerOverall,
          distribuicao_longa: playerOverall, drible: playerOverall, equilibrio: playerOverall, forca: playerOverall,
          forca_chute: playerOverall, marcacao: playerOverall, passe_alto: playerOverall, passe_baixo: playerOverall,
          pegada: playerOverall, posicionamento_defensivo: playerOverall, posicionamento_gol: playerOverall,
          posicionamento_ofensivo: playerOverall, pulo: playerOverall, reflexo: playerOverall, resistencia: playerOverall,
          saida_gol: playerOverall, stamina: playerOverall, tempo_reacao: playerOverall, tomada_decisao: playerOverall,
          trabalho_equipe: playerOverall, um_contra_um: playerOverall, um_toque: playerOverall, velocidade: playerOverall,
        }));
        await supabase.from('player_attributes').insert(attrInserts);

        await supabase.from('contracts').insert(players.map((p: any) => ({
          player_profile_id: p.id, club_id: club.id,
          weekly_salary: defaultSalary, release_clause: defaultSalary * 6,
          start_date: new Date().toISOString(),
          end_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'active',
        })));

        const { data: lineup } = await supabase.from('lineups').insert({
          club_id: club.id, name: 'Titular', formation: '4-4-2', is_active: true,
        }).select('id').single();
        if (lineup) {
          const usedIds = new Set<string>();
          const dedupedSlots: any[] = [];
          for (let idx = 0; idx < STARTER_POSITIONS_HOME.length; idx++) {
            const sp = STARTER_POSITIONS_HOME[idx];
            const matching = players.filter((pl: any) => pl.primary_position === sp.pos && !usedIds.has(pl.id));
            const fallback = players.find((pl: any) => !usedIds.has(pl.id));
            const selected = matching[0] ?? fallback;
            if (!selected) continue;
            usedIds.add(selected.id);
            dedupedSlots.push({
              lineup_id: lineup.id, player_profile_id: selected.id,
              slot_position: sp.pos, role_type: 'starter', sort_order: idx + 1,
            });
          }
          await supabase.from('lineup_slots').insert(dedupedSlots);
        }
      }

      // Game year = max season_number across all existing leagues, or 1.
      const { data: maxSeasonRow } = await supabase
        .from('league_seasons').select('season_number')
        .order('season_number', { ascending: false }).limit(1).maybeSingle();
      const gameYear = (maxSeasonRow?.season_number as number | undefined) ?? 1;

      const { data: season } = await supabase.from('league_seasons').insert({
        league_id: leagueId, season_number: gameYear, status: 'scheduled',
      }).select('id').single();
      if (!season) {
        return new Response(JSON.stringify({ error: 'Failed to create season' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      await supabase.from('league_standings').insert(
        botClubIds.map(clubId => ({ season_id: season.id, club_id: clubId })),
      );

      const fixtures = generateRoundRobin(botClubIds);
      const roundFixtures = new Map<number, { home: string; away: string }[]>();
      for (const f of fixtures) {
        if (!roundFixtures.has(f.round)) roundFixtures.set(f.round, []);
        roundFixtures.get(f.round)!.push({ home: f.home, away: f.away });
      }

      // Mirror dates from sibling at same game year if any exists.
      const { data: siblingRounds } = await supabase
        .from('league_rounds')
        .select('round_number, scheduled_at, season_id, league_seasons!inner(season_number, league_id)')
        .eq('league_seasons.season_number', gameYear)
        .neq('league_seasons.league_id', leagueId)
        .order('round_number', { ascending: true });
      const siblingDateByRound = new Map<number, string>();
      for (const sr of (siblingRounds ?? [])) {
        if (!siblingDateByRound.has((sr as any).round_number)) {
          siblingDateByRound.set((sr as any).round_number, (sr as any).scheduled_at);
        }
      }

      const startDate = new Date(body.start_date || Date.now());
      const dow = startDate.getUTCDay();
      const daysUntilWed = (3 - dow + 7) % 7 || 7;
      const firstWednesday = new Date(startDate);
      firstWednesday.setUTCDate(firstWednesday.getUTCDate() + daysUntilWed);
      firstWednesday.setUTCHours(24, 0, 0, 0);

      let currentWed = new Date(firstWednesday);
      for (let roundNum = 1; roundNum <= roundFixtures.size; roundNum++) {
        let roundDateIso: string;
        const sibling = siblingDateByRound.get(roundNum);
        if (sibling) {
          roundDateIso = sibling;
        } else {
          const isOdd = roundNum % 2 === 1;
          const fallbackDate = new Date(currentWed);
          if (!isOdd) fallbackDate.setUTCDate(fallbackDate.getUTCDate() + 4);
          if (!isOdd) currentWed.setUTCDate(currentWed.getUTCDate() + 7);
          roundDateIso = fallbackDate.toISOString();
        }

        const { data: round } = await supabase.from('league_rounds').insert({
          season_id: season.id, round_number: roundNum,
          scheduled_at: roundDateIso, status: 'scheduled',
        }).select('id').single();
        if (!round) continue;

        for (const fx of roundFixtures.get(roundNum) ?? []) {
          await supabase.from('league_matches').insert({
            round_id: round.id, match_id: null,
            home_club_id: fx.home, away_club_id: fx.away,
          });
        }
      }

      console.log(`[SEED] Created ${leagueName} (div ${division}) with ${botClubIds.length} bot clubs at game year ${gameYear}`);

      return new Response(JSON.stringify({
        status: 'created',
        league_id: leagueId, league_name: leagueName, division,
        season_id: season.id, game_year: gameYear,
        clubs: botClubIds.length, rounds: roundFixtures.size,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ────────────────────────────────────────────────────────────
    // seed_serie_b — create Liga Brasileira - Série B from scratch with
    // 20 fresh bot clubs (no carry-over from Série A) + Season 1.
    // Idempotent on the league name.
    // ────────────────────────────────────────────────────────────
    if (action === 'seed_serie_b') {
      const desiredName = 'Liga Brasileira - Série B';
      const { data: existingLeague } = await supabase
        .from('leagues')
        .select('id')
        .eq('name', desiredName)
        .maybeSingle();
      if (existingLeague) {
        return new Response(JSON.stringify({
          status: 'skipped',
          reason: 'Liga Brasileira - Série B already exists',
          league_id: existingLeague.id,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { data: league, error: leagueError } = await supabase.from('leagues').insert({
        name: desiredName,
        country: 'BR',
        division: 2,
        max_teams: 20,
        status: 'active',
      }).select('id').single();
      if (leagueError || !league) {
        return new Response(JSON.stringify({ error: `Failed to create league: ${leagueError?.message}` }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const leagueId = league.id;

      // Pull every existing club name in the DB to avoid collisions with
      // Série A or with anything the user may have created manually.
      const { data: allClubs } = await supabase.from('clubs').select('name');
      const usedNames = new Set((allClubs ?? []).map((c: any) => c.name));
      const availableTeams = TEAM_NAMES_SERIE_B.filter(t => !usedNames.has(t.name));
      const botClubIds: string[] = [];

      for (let i = 0; i < availableTeams.length && botClubIds.length < 20; i++) {
        const team = availableTeams[i];
        const colors = COLORS[i % COLORS.length];
        const stadiumName = STADIUM_NAMES[i % STADIUM_NAMES.length];

        const { data: botManager } = await supabase.from('manager_profiles').insert({
          user_id: null,
          full_name: `Bot Manager ${team.short}`,
          reputation: 15,
          money: 0,
          coach_type: 'all_around',
        }).select('id').single();
        if (!botManager) continue;

        const { data: club } = await supabase.from('clubs').insert({
          manager_profile_id: botManager.id,
          name: team.name,
          short_name: team.short,
          primary_color: colors.primary,
          secondary_color: colors.secondary,
          city: team.city,
          reputation: 15,
          status: 'active',
          league_id: leagueId,
          is_bot_managed: true,
        }).select('id').single();
        if (!club) continue;
        botClubIds.push(club.id);

        await supabase.from('club_finances').insert({
          club_id: club.id,
          balance: 150000, // Série B starts smaller than Série A's R$200k
          weekly_wage_bill: 4400, // 22 * 200
          projected_income: 9000,
          projected_expense: 3500,
        });

        await supabase.from('club_facilities').insert([
          { club_id: club.id, facility_type: 'souvenir_shop', level: 1 },
          { club_id: club.id, facility_type: 'sponsorship', level: 1 },
          { club_id: club.id, facility_type: 'training_center', level: 1 },
          { club_id: club.id, facility_type: 'stadium', level: 1 },
        ]);

        await supabase.from('stadiums').insert({
          club_id: club.id,
          name: stadiumName,
          capacity: 4000,
          quality: 25,
          prestige: 10,
          maintenance_cost: 1500,
        });

        await supabase.from('club_settings').insert({
          club_id: club.id,
          default_formation: '4-4-2',
          play_style: 'balanced',
        });

        // Same 22 bot players as Série A but with rating 45 (vs 50)
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
            overall: 45,
            reputation: 15,
            money: 0,
            weekly_salary: 200,
            energy_current: 100,
            energy_max: 100,
          });
        }

        const { data: players } = await supabase
          .from('player_profiles')
          .insert(playerInserts)
          .select('id, primary_position');
        if (!players) continue;

        const attrInserts = players.map((p: any) => ({
          player_profile_id: p.id,
          aceleracao: 45, acuracia_chute: 45, agilidade: 45, antecipacao: 45,
          cabeceio: 45, comando_area: 45, controle_bola: 45, coragem: 45,
          curva: 45, defesa_aerea: 45, desarme: 45, distribuicao_curta: 45,
          distribuicao_longa: 45, drible: 45, equilibrio: 45, forca: 45,
          forca_chute: 45, marcacao: 45, passe_alto: 45, passe_baixo: 45,
          pegada: 45, posicionamento_defensivo: 45, posicionamento_gol: 45,
          posicionamento_ofensivo: 45, pulo: 45, reflexo: 45, resistencia: 45,
          saida_gol: 45, stamina: 45, tempo_reacao: 45, tomada_decisao: 45,
          trabalho_equipe: 45, um_contra_um: 45, um_toque: 45, velocidade: 45,
        }));
        await supabase.from('player_attributes').insert(attrInserts);

        const contractInserts = players.map((p: any) => ({
          player_profile_id: p.id,
          club_id: club.id,
          weekly_salary: 200,
          release_clause: 1500,
          start_date: new Date().toISOString(),
          end_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'active',
        }));
        await supabase.from('contracts').insert(contractInserts);

        const { data: lineup } = await supabase.from('lineups').insert({
          club_id: club.id,
          name: 'Titular',
          formation: '4-4-2',
          is_active: true,
        }).select('id').single();
        if (lineup) {
          const usedIds = new Set<string>();
          const dedupedSlots: any[] = [];
          for (let idx = 0; idx < STARTER_POSITIONS_HOME.length; idx++) {
            const sp = STARTER_POSITIONS_HOME[idx];
            const matching = players.filter((p: any) => p.primary_position === sp.pos && !usedIds.has(p.id));
            const fallback = players.find((p: any) => !usedIds.has(p.id));
            const selected = matching[0] ?? fallback;
            if (!selected) continue;
            usedIds.add(selected.id);
            dedupedSlots.push({
              lineup_id: lineup.id,
              player_profile_id: selected.id,
              slot_position: sp.pos,
              role_type: 'starter',
              sort_order: idx + 1,
            });
          }
          await supabase.from('lineup_slots').insert(dedupedSlots);
        }
      }

      // Season number = current "game year" (max across ALL leagues), so a
      // new division created mid-game lines up with the rest of the world
      // instead of resetting back to season 1.
      const { data: maxSeasonRow } = await supabase
        .from('league_seasons')
        .select('season_number')
        .order('season_number', { ascending: false })
        .limit(1)
        .maybeSingle();
      const gameYear = (maxSeasonRow?.season_number as number | undefined) ?? 1;

      const { data: season } = await supabase.from('league_seasons').insert({
        league_id: leagueId,
        season_number: gameYear,
        status: 'scheduled',
      }).select('id').single();
      if (!season) {
        return new Response(JSON.stringify({ error: 'Failed to create Série B season' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      await supabase.from('league_standings').insert(
        botClubIds.map(clubId => ({ season_id: season.id, club_id: clubId })),
      );

      const fixtures = generateRoundRobin(botClubIds);
      const roundFixtures = new Map<number, { home: string; away: string }[]>();
      for (const f of fixtures) {
        if (!roundFixtures.has(f.round)) roundFixtures.set(f.round, []);
        roundFixtures.get(f.round)!.push({ home: f.home, away: f.away });
      }

      // Mirror the schedule of any sibling league running the same game year
      // so divisions kick off on the same dates. Falls back to a from-scratch
      // Wed/Sun schedule when this is the first league for the year.
      const { data: siblingRounds } = await supabase
        .from('league_rounds')
        .select('round_number, scheduled_at, season_id, league_seasons!inner(season_number, league_id)')
        .eq('league_seasons.season_number', gameYear)
        .neq('league_seasons.league_id', leagueId)
        .order('round_number', { ascending: true });

      const siblingDateByRound = new Map<number, string>();
      for (const sr of (siblingRounds ?? [])) {
        if (!siblingDateByRound.has((sr as any).round_number)) {
          siblingDateByRound.set((sr as any).round_number, (sr as any).scheduled_at);
        }
      }

      // Fallback schedule if there's no sibling: snap to next Wed at 21h BRT
      // and alternate Wed/Sun.
      const startDate = new Date(body.start_date || Date.now());
      const dow = startDate.getUTCDay();
      const daysUntilWed = (3 - dow + 7) % 7 || 7;
      const firstWednesday = new Date(startDate);
      firstWednesday.setUTCDate(firstWednesday.getUTCDate() + daysUntilWed);
      firstWednesday.setUTCHours(24, 0, 0, 0);

      let currentWed = new Date(firstWednesday);
      for (let roundNum = 1; roundNum <= roundFixtures.size; roundNum++) {
        let roundDateIso: string;
        const sibling = siblingDateByRound.get(roundNum);
        if (sibling) {
          roundDateIso = sibling;
        } else {
          const isOdd = roundNum % 2 === 1;
          const fallbackDate = new Date(currentWed);
          if (!isOdd) fallbackDate.setUTCDate(fallbackDate.getUTCDate() + 4);
          if (!isOdd) currentWed.setUTCDate(currentWed.getUTCDate() + 7);
          roundDateIso = fallbackDate.toISOString();
        }

        const { data: round } = await supabase.from('league_rounds').insert({
          season_id: season.id,
          round_number: roundNum,
          scheduled_at: roundDateIso,
          status: 'scheduled',
        }).select('id').single();
        if (!round) continue;

        for (const fx of roundFixtures.get(roundNum) ?? []) {
          await supabase.from('league_matches').insert({
            round_id: round.id,
            match_id: null,
            home_club_id: fx.home,
            away_club_id: fx.away,
          });
        }
      }

      console.log(`[SEED] Created Liga Brasileira - Série B with ${botClubIds.length} bot clubs (game year ${gameYear})`);

      return new Response(JSON.stringify({
        status: 'created',
        league_id: leagueId,
        season_id: season.id,
        clubs: botClubIds.length,
        rounds: roundFixtures.size,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ────────────────────────────────────────────────────────────
    // start_next_season — bootstrap Season N+1 for an existing league.
    // Idempotent: if Season N+1 already exists for the league, returns
    // its id without re-creating anything. Carries over all currently
    // active clubs in the league (no promotion/relegation yet).
    // First round scheduled at previous season's `next_season_at` (or
    // 14 days from now as fallback), then alternating Wed/Sun.
    // ────────────────────────────────────────────────────────────
    if (action === 'start_next_season') {
      const leagueId: string | undefined = body.league_id;
      if (!leagueId) {
        return new Response(JSON.stringify({ error: 'league_id required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Most recent season for this league (any status) — N+1 gets number+1.
      const { data: latest } = await supabase
        .from('league_seasons')
        .select('id, season_number, status, finished_at, next_season_at')
        .eq('league_id', leagueId)
        .order('season_number', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!latest) {
        return new Response(JSON.stringify({ error: 'no existing season for league' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Idempotency: only create if the latest is finished. If it's still
      // active or scheduled, skip. If a higher-number season already exists
      // (which can't happen given the ORDER BY but defensive), return it.
      if (latest.status !== 'finished') {
        return new Response(JSON.stringify({
          status: 'skipped',
          reason: `latest season status is ${latest.status}`,
          existing_season_id: latest.id,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const nextSeasonNumber = (latest.season_number ?? 0) + 1;
      const nextStartAt = latest.next_season_at
        ? new Date(latest.next_season_at)
        : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

      // Active clubs in this league carry over to the next season.
      const { data: leagueClubs } = await supabase
        .from('clubs')
        .select('id')
        .eq('league_id', leagueId)
        .eq('status', 'active');

      const clubIds = (leagueClubs ?? []).map((c: any) => c.id);
      if (clubIds.length < 2) {
        return new Response(JSON.stringify({ error: `not enough clubs (${clubIds.length})` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Create the season row
      const { data: newSeason, error: seasonErr } = await supabase
        .from('league_seasons')
        .insert({
          league_id: leagueId,
          season_number: nextSeasonNumber,
          status: 'scheduled',
        })
        .select('id')
        .single();

      if (seasonErr || !newSeason) {
        return new Response(JSON.stringify({ error: `season insert failed: ${seasonErr?.message}` }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Standings rows for every club
      await supabase.from('league_standings').insert(
        clubIds.map((clubId) => ({ season_id: newSeason.id, club_id: clubId })),
      );

      // Round-robin fixtures (same algorithm as initial seed)
      const fixtures = generateRoundRobin(clubIds);
      const roundFixtures = new Map<number, { home: string; away: string }[]>();
      for (const f of fixtures) {
        if (!roundFixtures.has(f.round)) roundFixtures.set(f.round, []);
        roundFixtures.get(f.round)!.push({ home: f.home, away: f.away });
      }

      // If a sibling league is already on the same game year (N+1), mirror
      // its round dates so divisions stay synchronized. Otherwise compute
      // a fresh Wed/Sun schedule starting at nextStartAt.
      const { data: siblingRounds } = await supabase
        .from('league_rounds')
        .select('round_number, scheduled_at, season_id, league_seasons!inner(season_number, league_id)')
        .eq('league_seasons.season_number', nextSeasonNumber)
        .neq('league_seasons.league_id', leagueId)
        .order('round_number', { ascending: true });

      const siblingDateByRound = new Map<number, string>();
      for (const sr of (siblingRounds ?? [])) {
        if (!siblingDateByRound.has((sr as any).round_number)) {
          siblingDateByRound.set((sr as any).round_number, (sr as any).scheduled_at);
        }
      }

      // Fallback: round 1 at nextStartAt (snapped to next Wed at 21h BRT),
      // alternating Wed/Sun (Sun = Wed + 4d).
      const startWed = new Date(nextStartAt);
      const dow = startWed.getUTCDay();
      const daysUntilWed = (3 - dow + 7) % 7; // 0 if already Wed
      if (daysUntilWed > 0) startWed.setUTCDate(startWed.getUTCDate() + daysUntilWed);
      startWed.setUTCHours(0, 0, 0, 0); // 21h BRT = 00h UTC of the next day
      startWed.setUTCDate(startWed.getUTCDate() + 1);

      let currentWed = new Date(startWed);
      for (let roundNum = 1; roundNum <= roundFixtures.size; roundNum++) {
        let roundDateIso: string;
        const sibling = siblingDateByRound.get(roundNum);
        if (sibling) {
          roundDateIso = sibling;
        } else {
          const isOdd = roundNum % 2 === 1;
          const fallbackDate = new Date(currentWed);
          if (!isOdd) fallbackDate.setUTCDate(fallbackDate.getUTCDate() + 4); // Sun
          if (!isOdd) currentWed.setUTCDate(currentWed.getUTCDate() + 7); // advance after Sun
          roundDateIso = fallbackDate.toISOString();
        }

        const { data: round } = await supabase
          .from('league_rounds')
          .insert({
            season_id: newSeason.id,
            round_number: roundNum,
            scheduled_at: roundDateIso,
            status: 'scheduled',
          })
          .select('id')
          .single();
        if (!round) continue;

        const matchFixtures = roundFixtures.get(roundNum) ?? [];
        for (const fx of matchFixtures) {
          await supabase.from('league_matches').insert({
            round_id: round.id,
            match_id: null,
            home_club_id: fx.home,
            away_club_id: fx.away,
          });
        }
      }

      console.log(`[SEED] Created Season ${nextSeasonNumber} for league ${leagueId} with ${clubIds.length} clubs`);

      return new Response(JSON.stringify({
        status: 'created',
        season_id: newSeason.id,
        season_number: nextSeasonNumber,
        clubs: clubIds.length,
        rounds: roundFixtures.size,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Unknown action. Use: seed_league | start_next_season' }), {
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
