-- ============================================================
-- SEED: Liga Brasileira - Serie A
-- Run this in the Supabase SQL Editor.
-- It is mostly idempotent: re-running will skip already-created
-- objects where possible (league, season, etc.).
-- ============================================================

-- First, ensure bot rows can have NULL user_id.
-- The original DDL marks user_id NOT NULL; bots need NULL.
ALTER TABLE public.manager_profiles ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.player_profiles  ALTER COLUMN user_id DROP NOT NULL;

-- Also drop the UNIQUE on player_profiles.user_id so multiple bots
-- (all with user_id = NULL) do not collide.  (NULLs don't violate
-- unique in Postgres, but the UNIQUE index still exists; this is
-- safe but let's be explicit.)
-- We recreate as a partial unique index that only covers non-null.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.player_profiles'::regclass
      AND contype = 'u'
      AND conname = 'player_profiles_user_id_key'
  ) THEN
    ALTER TABLE public.player_profiles DROP CONSTRAINT player_profiles_user_id_key;
    CREATE UNIQUE INDEX IF NOT EXISTS player_profiles_user_id_key
      ON public.player_profiles (user_id) WHERE user_id IS NOT NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.manager_profiles'::regclass
      AND contype = 'u'
      AND conname = 'manager_profiles_user_id_key'
  ) THEN
    ALTER TABLE public.manager_profiles DROP CONSTRAINT manager_profiles_user_id_key;
    CREATE UNIQUE INDEX IF NOT EXISTS manager_profiles_user_id_key
      ON public.manager_profiles (user_id) WHERE user_id IS NOT NULL;
  END IF;
END $$;

-- Same for clubs: one manager can own one club, but bot managers each
-- own one club too (the UNIQUE(manager_profile_id) is fine since each
-- bot gets its own manager row).

-- ============================================================
-- MAIN SEED BLOCK
-- ============================================================
DO $$
DECLARE
  -- league / season
  v_league_id     UUID;
  v_season_id     UUID;

  -- helpers
  v_existing_count  INT;
  v_bots_needed     INT;
  v_bot_idx         INT := 0;

  -- per-bot club loop
  v_mgr_id        UUID;
  v_club_id       UUID;
  v_lineup_id     UUID;
  v_player_id     UUID;
  v_player_ids    UUID[];

  -- round-robin
  v_all_club_ids  UUID[];
  v_teams         UUID[];  -- mutable copy for rotation
  v_n             INT;
  v_half          INT;
  v_round         INT;
  v_i             INT;
  v_home_id       UUID;
  v_away_id       UUID;
  v_last          UUID;
  v_round_id      UUID;
  v_match_id      UUID;
  v_round_date    TIMESTAMPTZ;
  v_current_wed   TIMESTAMPTZ;

  -- team data arrays (name, short, city)
  v_team_names    TEXT[] := ARRAY[
    'Estrela FC','Tubarao SC','Falcao EC','Leoes da Serra','Guarana AC',
    'Trovao FC','Aguia Dourada','Mare FC','Fenix EC','Dragao Azul',
    'Pantera SC','Ventania FC','Lobo Bravo','Raio FC','Tita EC',
    'Cobra Real','Vulcao SC','Cometa FC','Jaguar AC','Tsunami EC'
  ];
  v_team_shorts   TEXT[] := ARRAY[
    'EST','TUB','FAL','LEO','GUA','TRO','AGD','MAR','FEN','DRA',
    'PAN','VEN','LOB','RAI','TIT','COB','VUL','COM','JAG','TSU'
  ];
  v_team_cities   TEXT[] := ARRAY[
    'Sao Paulo','Santos','Rio de Janeiro','Curitiba','Manaus',
    'Belo Horizonte','Brasilia','Salvador','Recife','Porto Alegre',
    'Fortaleza','Goiania','Campinas','Florianopolis','Belem',
    'Vitoria','Natal','Cuiaba','Maceio','Joao Pessoa'
  ];
  v_primary_colors  TEXT[] := ARRAY[
    '#FF0000','#0000FF','#008000','#FFD700','#800080',
    '#FF4500','#00CED1','#DC143C','#006400','#191970',
    '#8B0000','#2F4F4F','#FF1493','#1E90FF','#B8860B',
    '#4B0082','#228B22','#CD853F','#483D8B','#708090'
  ];
  v_secondary_colors TEXT[] := ARRAY[
    '#FFFFFF','#FFFFFF','#FFFFFF','#000000','#FFFFFF',
    '#000000','#000000','#FFD700','#FFD700','#FF6347',
    '#FFFFFF','#00FA9A','#000000','#FFFFFF','#000000',
    '#FFD700','#FF4500','#FFFFFF','#00FF7F','#FF6347'
  ];
  v_stadium_names TEXT[] := ARRAY[
    'Arena do Povo','Estadio Municipal','Arena Central','Estadio da Vitoria',
    'Arena do Norte','Estadio Gigante','Arena Sol','Estadio da Paz',
    'Arena Tropical','Estadio Imperial','Arena Raio','Estadio Novo',
    'Arena Ouro','Estadio do Mar','Arena da Selva','Estadio Real',
    'Arena Fogo','Estadio da Serra','Arena Brasa','Estadio do Vale'
  ];

  -- bot player positions (22 per club)
  v_bot_positions TEXT[] := ARRAY[
    'GK','GK',
    'CB','CB','CB','CB','LB','RB',
    'CDM','CDM','CM','CM','LM','RM',
    'CAM','CAM',
    'LW','RW',
    'ST','ST','CF','CF'
  ];

  -- 11 starter slots: position (unique names for lineup constraint), x, y
  -- The slot_position must be unique per lineup, so we use CB1/CB2 etc.
  v_starter_pos   TEXT[] := ARRAY['GK','CB','CB2','LB','RB','CDM','CM','LM','RM','ST','CF'];
  -- Map slot to actual player position for matching
  v_starter_match TEXT[] := ARRAY['GK','CB','CB','LB','RB','CDM','CM','LM','RM','ST','CF'];
  v_starter_x     INT[]  := ARRAY[5,20,20,20,20,35,35,50,50,65,65];
  v_starter_y     INT[]  := ARRAY[50,30,50,15,85,35,65,15,85,40,60];

  -- Brazilian first / last names for random bot players
  v_first_names TEXT[] := ARRAY[
    'Lucas','Gabriel','Rafael','Matheus','Bruno','Felipe','Diego','Thiago',
    'Andre','Carlos','Pedro','Joao','Marcos','Rodrigo','Gustavo','Henrique',
    'Leonardo','Vinicius','Kaique','Davi','Eduardo','Daniel','Caio','Igor',
    'Renato','Fabio','Alex','Leandro','Hugo','Murilo','Yago','Breno',
    'Samuel','Nathan','Enzo','Bernardo','Arthur','Ryan','Nicolas','Heitor'
  ];
  v_last_names TEXT[] := ARRAY[
    'Silva','Santos','Oliveira','Souza','Pereira','Costa','Rodrigues',
    'Almeida','Nascimento','Lima','Araujo','Fernandes','Carvalho','Gomes',
    'Martins','Rocha','Ribeiro','Barros','Freitas','Moreira','Mendes',
    'Teixeira','Correia','Vieira','Monteiro','Cardoso','Melo','Pinto'
  ];

  v_pos           TEXT;
  v_age           INT;
  v_full_name     TEXT;
  v_j             INT;
  v_slot_pos      TEXT;
  v_used_player_ids UUID[];
  v_sel_player    UUID;
  v_found         BOOLEAN;
  v_k             INT;
BEGIN
  -- ================================================================
  -- STEP 1: Create the league (idempotent)
  -- ================================================================
  SELECT id INTO v_league_id
    FROM public.leagues
   WHERE name = 'Liga Brasileira - Serie A'
   LIMIT 1;

  IF v_league_id IS NULL THEN
    INSERT INTO public.leagues (name, country, division, max_teams, status)
    VALUES ('Liga Brasileira - Serie A', 'BR', 1, 20, 'active')
    RETURNING id INTO v_league_id;
    RAISE NOTICE '[SEED] Created league id=%', v_league_id;
  ELSE
    RAISE NOTICE '[SEED] League already exists id=%', v_league_id;
  END IF;

  -- ================================================================
  -- STEP 2: Attach existing human-managed clubs
  -- ================================================================
  -- "Existing" = clubs whose manager_profile has a non-null user_id,
  -- that are not yet in a league.
  v_all_club_ids := ARRAY[]::UUID[];

  FOR v_club_id IN
    SELECT c.id
      FROM public.clubs c
      JOIN public.manager_profiles mp ON mp.id = c.manager_profile_id
     WHERE mp.user_id IS NOT NULL
       AND c.league_id IS NULL
       AND c.status = 'active'
  LOOP
    UPDATE public.clubs
       SET league_id = v_league_id,
           is_bot_managed = false
     WHERE id = v_club_id;

    -- ensure 4 facility types exist
    INSERT INTO public.club_facilities (club_id, facility_type, level)
    SELECT v_club_id, ft, 1
      FROM unnest(ARRAY['souvenir_shop','sponsorship','training_center','stadium']) AS ft
     WHERE NOT EXISTS (
       SELECT 1 FROM public.club_facilities
        WHERE club_id = v_club_id AND facility_type = ft
     );

    v_all_club_ids := v_all_club_ids || v_club_id;
    RAISE NOTICE '[SEED] Attached existing club % to league', v_club_id;
  END LOOP;

  v_existing_count := array_length(v_all_club_ids, 1);
  IF v_existing_count IS NULL THEN v_existing_count := 0; END IF;
  v_bots_needed := 20 - v_existing_count;
  RAISE NOTICE '[SEED] Existing clubs: %, bots needed: %', v_existing_count, v_bots_needed;

  -- ================================================================
  -- STEP 3: Create bot clubs
  -- ================================================================
  v_bot_idx := 0;
  WHILE v_bot_idx < v_bots_needed LOOP
    v_bot_idx := v_bot_idx + 1;

    -- Skip names that collide with an existing club
    -- (simple approach: just use array index; if name already taken
    --  by an existing club attached above, skip it)
    DECLARE
      v_tname TEXT := v_team_names[v_bot_idx];
      v_tshort TEXT := v_team_shorts[v_bot_idx];
      v_tcity TEXT := v_team_cities[v_bot_idx];
      v_prim  TEXT := v_primary_colors[v_bot_idx];
      v_sec   TEXT := v_secondary_colors[v_bot_idx];
      v_stad  TEXT := v_stadium_names[v_bot_idx];
      v_name_exists BOOLEAN;
    BEGIN
      SELECT EXISTS(SELECT 1 FROM public.clubs WHERE name = v_tname)
        INTO v_name_exists;
      IF v_name_exists THEN
        RAISE NOTICE '[SEED] Skipping bot club "%", name already exists', v_tname;
        CONTINUE;
      END IF;

      -- 3a. Bot manager_profile (user_id = NULL)
      INSERT INTO public.manager_profiles (user_id, full_name, reputation, money, coach_type)
      VALUES (NULL, 'Bot Manager ' || v_tshort, 20, 0, 'all_around')
      RETURNING id INTO v_mgr_id;

      -- 3b. Club
      INSERT INTO public.clubs (
        manager_profile_id, name, short_name,
        primary_color, secondary_color, city,
        reputation, status, league_id, is_bot_managed
      ) VALUES (
        v_mgr_id, v_tname, v_tshort,
        v_prim, v_sec, v_tcity,
        20, 'active', v_league_id, true
      ) RETURNING id INTO v_club_id;

      v_all_club_ids := v_all_club_ids || v_club_id;

      -- 3c. Club finances
      INSERT INTO public.club_finances (club_id, balance, weekly_wage_bill, projected_income, projected_expense)
      VALUES (v_club_id, 200000, 5500, 12000, 4000);

      -- 3d. Club facilities (4 types, level 1)
      INSERT INTO public.club_facilities (club_id, facility_type, level) VALUES
        (v_club_id, 'souvenir_shop', 1),
        (v_club_id, 'sponsorship', 1),
        (v_club_id, 'training_center', 1),
        (v_club_id, 'stadium', 1);

      -- 3e. Stadium
      INSERT INTO public.stadiums (club_id, name, capacity, quality, prestige, maintenance_cost)
      VALUES (v_club_id, v_stad, 5000, 30, 15, 2000);

      -- 3f. Club settings
      INSERT INTO public.club_settings (club_id, default_formation, play_style)
      VALUES (v_club_id, '4-4-2', 'balanced');

      -- 3g. Create 22 bot players
      v_player_ids := ARRAY[]::UUID[];
      FOR v_j IN 1 .. array_length(v_bot_positions, 1) LOOP
        v_pos := v_bot_positions[v_j];

        -- random name
        v_full_name := v_first_names[1 + floor(random() * array_length(v_first_names,1))::INT]
                    || ' '
                    || v_last_names[1 + floor(random() * array_length(v_last_names,1))::INT];

        -- age by position
        IF v_pos = 'GK' THEN
          v_age := 25 + floor(random() * 10)::INT;
        ELSIF v_pos IN ('ST','CF','LW','RW') THEN
          v_age := 20 + floor(random() * 8)::INT;
        ELSE
          v_age := 22 + floor(random() * 8)::INT;
        END IF;

        INSERT INTO public.player_profiles (
          user_id, club_id, full_name, age, height, dominant_foot,
          primary_position, secondary_position, archetype,
          overall, reputation, money, weekly_salary,
          energy_current, energy_max
        ) VALUES (
          NULL,
          v_club_id::TEXT,
          v_full_name,
          v_age,
          CASE
            WHEN v_pos = 'GK' THEN 'Alto'
            WHEN v_pos IN ('CB','ST','CF') THEN
              (ARRAY['Medio','Alto'])[1 + floor(random()*2)::INT]
            ELSE
              (ARRAY['Baixo','Medio'])[1 + floor(random()*2)::INT]
          END,
          CASE WHEN random() > 0.3 THEN 'right' ELSE 'left' END,
          v_pos,
          NULL,
          'balanced',
          50, 20, 0, 250,
          100, 100
        ) RETURNING id INTO v_player_id;

        v_player_ids := v_player_ids || v_player_id;

        -- player attributes (all 50)
        INSERT INTO public.player_attributes (
          player_profile_id,
          aceleracao, acuracia_chute, agilidade, antecipacao,
          cabeceio, comando_area, controle_bola, coragem,
          curva, defesa_aerea, desarme, distribuicao_curta,
          distribuicao_longa, drible, equilibrio, forca,
          forca_chute, marcacao, passe_alto, passe_baixo,
          pegada, posicionamento_defensivo, posicionamento_gol,
          posicionamento_ofensivo, pulo, reflexo, resistencia,
          saida_gol, stamina, tempo_reacao, tomada_decisao,
          trabalho_equipe, um_contra_um, um_toque, velocidade,
          visao_jogo
        ) VALUES (
          v_player_id,
          50,50,50,50,
          50,50,50,50,
          50,50,50,50,
          50,50,50,50,
          50,50,50,50,
          50,50,50,
          50,50,50,50,
          50,50,50,50,
          50,50,50,50,
          50
        );

        -- contract
        INSERT INTO public.contracts (
          player_profile_id, club_id, weekly_salary, release_clause,
          start_date, end_date, status
        ) VALUES (
          v_player_id,
          v_club_id::TEXT,
          250,
          2500,
          CURRENT_DATE,
          CURRENT_DATE + INTERVAL '1 year',
          'active'
        );
      END LOOP; -- players

      -- 3h. Lineup with 11 starters
      INSERT INTO public.lineups (club_id, name, formation, is_active)
      VALUES (v_club_id, 'Titular', '4-4-2', true)
      RETURNING id INTO v_lineup_id;

      v_used_player_ids := ARRAY[]::UUID[];
      FOR v_j IN 1 .. array_length(v_starter_pos, 1) LOOP
        v_slot_pos := v_starter_pos[v_j];  -- unique name for constraint (CB, CB2, etc.)
        v_sel_player := NULL;

        -- find a player with matching position not yet used
        -- use v_starter_match for actual position matching
        FOR v_k IN 1 .. array_length(v_player_ids, 1) LOOP
          IF v_bot_positions[v_k] = v_starter_match[v_j]
             AND NOT (v_player_ids[v_k] = ANY(v_used_player_ids))
          THEN
            v_sel_player := v_player_ids[v_k];
            EXIT;
          END IF;
        END LOOP;

        -- fallback: any unused player
        IF v_sel_player IS NULL THEN
          FOR v_k IN 1 .. array_length(v_player_ids, 1) LOOP
            IF NOT (v_player_ids[v_k] = ANY(v_used_player_ids)) THEN
              v_sel_player := v_player_ids[v_k];
              EXIT;
            END IF;
          END LOOP;
        END IF;

        v_used_player_ids := v_used_player_ids || v_sel_player;

        INSERT INTO public.lineup_slots (
          lineup_id, player_profile_id, slot_position, role_type, sort_order
        ) VALUES (
          v_lineup_id, v_sel_player, v_slot_pos, 'starter', v_j
        );
      END LOOP; -- starter slots

      RAISE NOTICE '[SEED] Created bot club "%" (%) with 22 players', v_tname, v_club_id;
    END; -- inner DECLARE block
  END LOOP; -- bots

  -- ================================================================
  -- STEP 4: Create season 1
  -- ================================================================
  SELECT id INTO v_season_id
    FROM public.league_seasons
   WHERE league_id = v_league_id AND season_number = 1
   LIMIT 1;

  IF v_season_id IS NULL THEN
    INSERT INTO public.league_seasons (league_id, season_number, status)
    VALUES (v_league_id, 1, 'scheduled')
    RETURNING id INTO v_season_id;
    RAISE NOTICE '[SEED] Created season 1 id=%', v_season_id;
  ELSE
    RAISE NOTICE '[SEED] Season 1 already exists id=%', v_season_id;
  END IF;

  -- League standings for all 20 clubs
  FOR v_i IN 1 .. array_length(v_all_club_ids, 1) LOOP
    INSERT INTO public.league_standings (season_id, club_id)
    VALUES (v_season_id, v_all_club_ids[v_i])
    ON CONFLICT (season_id, club_id) DO NOTHING;
  END LOOP;
  RAISE NOTICE '[SEED] Created standings for % clubs', array_length(v_all_club_ids, 1);

  -- ================================================================
  -- STEP 5: Round-robin fixtures (circle method)
  -- ================================================================
  v_n    := array_length(v_all_club_ids, 1);  -- should be 20
  v_half := v_n / 2;                          -- 10

  -- copy into mutable array (1-indexed)
  v_teams := v_all_club_ids;

  -- Schedule start: Wed 2026-04-02 00:00 UTC (= 21h BRT Apr 1)
  v_current_wed := '2026-04-02T00:00:00+00:00'::TIMESTAMPTZ;

  FOR v_round IN 1 .. (v_n - 1) LOOP
    -- Determine round date
    IF v_round % 2 = 1 THEN
      -- odd round = Wednesday
      v_round_date := v_current_wed;
    ELSE
      -- even round = Sunday (Wed + 4 days)
      v_round_date := v_current_wed + INTERVAL '4 days';
    END IF;

    -- After even round, advance Wednesday by 7 days
    IF v_round % 2 = 0 THEN
      v_current_wed := v_current_wed + INTERVAL '7 days';
    END IF;

    -- Create league_round
    INSERT INTO public.league_rounds (season_id, round_number, scheduled_at, status)
    VALUES (v_season_id, v_round, v_round_date, 'scheduled')
    RETURNING id INTO v_round_id;

    -- Generate 10 matches for this round
    FOR v_i IN 1 .. v_half LOOP
      v_home_id := v_teams[v_i];
      v_away_id := v_teams[v_n + 1 - v_i];

      -- Alternate home/away by round parity (same as the TS code)
      IF v_round % 2 = 0 THEN
        -- swap
        v_match_id := v_home_id;
        v_home_id  := v_away_id;
        v_away_id  := v_match_id;  -- temp swap via v_match_id
      END IF;

      -- Match row materialized 5 min before kickoff by league-scheduler cron
      INSERT INTO public.league_matches (round_id, match_id, home_club_id, away_club_id)
      VALUES (v_round_id, NULL, v_home_id, v_away_id);
    END LOOP; -- matches in round

    RAISE NOTICE '[SEED] Round % scheduled at % with 10 matches', v_round, v_round_date;

    -- Rotate: fix teams[1], rotate teams[2..n]
    -- Take last element, insert it at position 2
    v_last := v_teams[v_n];
    FOR v_i IN REVERSE v_n .. 3 LOOP
      v_teams[v_i] := v_teams[v_i - 1];
    END LOOP;
    v_teams[2] := v_last;

  END LOOP; -- rounds

  RAISE NOTICE '[SEED] ============================================';
  RAISE NOTICE '[SEED] DONE! League seeded successfully.';
  RAISE NOTICE '[SEED] League ID : %', v_league_id;
  RAISE NOTICE '[SEED] Season ID : %', v_season_id;
  RAISE NOTICE '[SEED] Total clubs: %', array_length(v_all_club_ids, 1);
  RAISE NOTICE '[SEED] Existing  : %', v_existing_count;
  RAISE NOTICE '[SEED] Bots      : %', v_bots_needed;
  RAISE NOTICE '[SEED] Rounds    : %', v_n - 1;
  RAISE NOTICE '[SEED] ============================================';
END $$;
