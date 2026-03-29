-- ============================================================
-- Migration: Fill old clubs with bot players up to 22
-- Creates bot player_profiles, player_attributes, and contracts
-- for clubs that have fewer than 22 players.
-- Also creates/updates lineup with 11 starters if missing.
-- ============================================================

-- Helper function to generate random Brazilian names
CREATE OR REPLACE FUNCTION _temp_random_bot_name()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  first_names TEXT[] := ARRAY[
    'Lucas', 'Gabriel', 'Rafael', 'Matheus', 'Bruno', 'Felipe', 'Diego', 'Thiago',
    'André', 'Carlos', 'Pedro', 'João', 'Marcos', 'Rodrigo', 'Gustavo', 'Henrique',
    'Leonardo', 'Vinícius', 'Kaique', 'Davi', 'Eduardo', 'Daniel', 'Caio', 'Igor',
    'Renato', 'Fábio', 'Alex', 'Leandro', 'Hugo', 'Murilo', 'Yago', 'Breno',
    'Samuel', 'Nathan', 'Enzo', 'Bernardo', 'Arthur', 'Ryan', 'Nicolas', 'Heitor'
  ];
  last_names TEXT[] := ARRAY[
    'Silva', 'Santos', 'Oliveira', 'Souza', 'Pereira', 'Costa', 'Rodrigues',
    'Almeida', 'Nascimento', 'Lima', 'Araújo', 'Fernandes', 'Carvalho', 'Gomes',
    'Martins', 'Rocha', 'Ribeiro', 'Barros', 'Freitas', 'Moreira', 'Mendes',
    'Teixeira', 'Correia', 'Vieira', 'Monteiro', 'Cardoso', 'Melo', 'Pinto'
  ];
BEGIN
  RETURN first_names[1 + floor(random() * array_length(first_names, 1))::int]
    || ' '
    || last_names[1 + floor(random() * array_length(last_names, 1))::int];
END;
$$;

-- Main fill function
DO $$
DECLARE
  v_club RECORD;
  v_current_count INT;
  v_needed INT;
  v_positions TEXT[] := ARRAY[
    'GK', 'GK',
    'CB', 'CB', 'CB', 'CB', 'LB', 'RB',
    'CDM', 'CDM', 'CM', 'CM', 'LM', 'RM',
    'CAM', 'CAM',
    'LW', 'RW',
    'ST', 'ST', 'CF', 'CF'
  ];
  v_starter_positions TEXT[] := ARRAY[
    'GK', 'CB', 'CB', 'LB', 'RB', 'CDM', 'CM', 'LM', 'RM', 'ST', 'CF'
  ];
  v_pos TEXT;
  v_idx INT;
  v_player_id UUID;
  v_age INT;
  v_lineup_id UUID;
  v_players_created INT;
  v_lineup_exists BOOLEAN;
BEGIN
  -- Loop through all clubs
  FOR v_club IN SELECT id, name FROM clubs LOOP
    -- Count current players
    SELECT count(*) INTO v_current_count
      FROM player_profiles
     WHERE club_id = v_club.id;

    v_needed := 22; -- Always add 22 bots
    v_players_created := 0;

    -- Create 22 bot players using the standard position template
    FOR v_idx IN 1..v_needed LOOP
      v_pos := v_positions[v_idx];

      -- Age based on position
      IF v_pos = 'GK' THEN
        v_age := 25 + floor(random() * 10)::int;
      ELSIF v_pos IN ('ST', 'CF', 'LW', 'RW') THEN
        v_age := 20 + floor(random() * 8)::int;
      ELSE
        v_age := 22 + floor(random() * 8)::int;
      END IF;

      -- Insert player profile
      INSERT INTO player_profiles (
        club_id, full_name, age, height, dominant_foot,
        primary_position, secondary_position, archetype,
        overall, reputation, money, weekly_salary,
        energy_current, energy_max
      ) VALUES (
        v_club.id,
        _temp_random_bot_name(),
        v_age,
        170 + floor(random() * 20)::int,
        CASE WHEN random() > 0.3 THEN 'right' ELSE 'left' END,
        v_pos,
        NULL,
        'balanced',
        50,
        20,
        0,
        250,
        100,
        100
      ) RETURNING id INTO v_player_id;

      -- Insert player attributes (all 50)
      INSERT INTO player_attributes (
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
        50, 50, 50, 50,
        50, 50, 50, 50,
        50, 50, 50, 50,
        50, 50, 50, 50,
        50, 50, 50, 50,
        50, 50, 50,
        50, 50, 50, 50,
        50, 50, 50, 50,
        50, 50, 50, 50,
        50
      );

      -- Insert contract
      INSERT INTO contracts (
        player_profile_id, club_id, weekly_salary, release_clause,
        start_date, end_date, status
      ) VALUES (
        v_player_id,
        v_club.id,
        250,
        2500,
        now()::date,
        (now() + interval '1 year')::date,
        'active'
      );

      v_players_created := v_players_created + 1;
    END LOOP;

    RAISE NOTICE 'Club % (%): had % players, added 22 bots (now %)',
      v_club.name, v_club.id, v_current_count, v_current_count + 22;

    -- ── Ensure club has an active lineup with 11 starters ──
    SELECT EXISTS(
      SELECT 1 FROM lineups WHERE club_id = v_club.id AND is_active = true
    ) INTO v_lineup_exists;

    IF NOT v_lineup_exists THEN
      -- Create a default 4-4-2 lineup
      INSERT INTO lineups (club_id, formation, is_active)
      VALUES (v_club.id, '4-4-2', true)
      RETURNING id INTO v_lineup_id;

      -- Fill 11 starter slots from available players
      DECLARE
        v_slot_idx INT := 0;
        v_slot_pos TEXT;
        v_slot_player_id UUID;
        v_used_player_ids UUID[] := ARRAY[]::UUID[];
      BEGIN
        FOREACH v_slot_pos IN ARRAY v_starter_positions LOOP
          v_slot_idx := v_slot_idx + 1;

          -- Find a player matching position, not yet used
          SELECT id INTO v_slot_player_id
            FROM player_profiles
           WHERE club_id = v_club.id
             AND primary_position = v_slot_pos
             AND id != ALL(v_used_player_ids)
           LIMIT 1;

          -- Fallback: any unused player
          IF v_slot_player_id IS NULL THEN
            SELECT id INTO v_slot_player_id
              FROM player_profiles
             WHERE club_id = v_club.id
               AND id != ALL(v_used_player_ids)
             LIMIT 1;
          END IF;

          IF v_slot_player_id IS NOT NULL THEN
            INSERT INTO lineup_slots (lineup_id, player_profile_id, slot_position, role_type, sort_order)
            VALUES (v_lineup_id, v_slot_player_id, v_slot_pos, 'starter', v_slot_idx);
            v_used_player_ids := array_append(v_used_player_ids, v_slot_player_id);
          END IF;
        END LOOP;
      END;

      RAISE NOTICE 'Club % (%): created default lineup with 11 starters', v_club.name, v_club.id;
    END IF;

  END LOOP;
END;
$$;

-- Clean up temp function
DROP FUNCTION IF EXISTS _temp_random_bot_name();
