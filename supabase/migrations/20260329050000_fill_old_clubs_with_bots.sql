-- ============================================================
-- Migration: Add 22 bot players to clubs with < 10 players
-- Creates bot player_profiles, player_attributes, and contracts.
-- Does NOT touch lineups.
-- ============================================================

CREATE OR REPLACE FUNCTION _temp_random_bot_name()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  fn TEXT[] := ARRAY['Lucas','Gabriel','Rafael','Matheus','Bruno','Felipe','Diego','Thiago','André','Carlos','Pedro','João','Marcos','Rodrigo','Gustavo','Henrique','Leonardo','Vinícius','Kaique','Davi','Eduardo','Daniel','Caio','Igor','Renato','Fábio','Alex','Leandro','Hugo','Murilo','Yago','Breno','Samuel','Nathan','Enzo','Bernardo','Arthur','Ryan','Nicolas','Heitor'];
  ln TEXT[] := ARRAY['Silva','Santos','Oliveira','Souza','Pereira','Costa','Rodrigues','Almeida','Nascimento','Lima','Araújo','Fernandes','Carvalho','Gomes','Martins','Rocha','Ribeiro','Barros','Freitas','Moreira','Mendes','Teixeira','Correia','Vieira','Monteiro','Cardoso','Melo','Pinto'];
BEGIN
  RETURN fn[1 + floor(random() * array_length(fn,1))::int] || ' ' || ln[1 + floor(random() * array_length(ln,1))::int];
END; $$;

DO $$
DECLARE
  v_club RECORD;
  v_current_count INT;
  v_positions TEXT[] := ARRAY['GK','GK','CB','CB','CB','CB','LB','RB','CDM','CDM','CM','CM','LM','RM','CAM','CAM','LW','RW','ST','ST','CF','CF'];
  v_pos TEXT;
  v_idx INT;
  v_player_id UUID;
  v_age INT;
BEGIN
  FOR v_club IN
    SELECT c.id, c.name
      FROM clubs c
     WHERE (SELECT count(*) FROM player_profiles pp WHERE pp.club_id = c.id::text) < 10
  LOOP
    SELECT count(*) INTO v_current_count FROM player_profiles WHERE club_id = v_club.id::text;

    FOR v_idx IN 1..22 LOOP
      v_pos := v_positions[v_idx];
      v_age := CASE
        WHEN v_pos = 'GK' THEN 25 + floor(random()*10)::int
        WHEN v_pos IN ('ST','CF','LW','RW') THEN 20 + floor(random()*8)::int
        ELSE 22 + floor(random()*8)::int
      END;

      INSERT INTO player_profiles (club_id, full_name, age, height, dominant_foot, primary_position, archetype, overall, reputation, money, weekly_salary, energy_current, energy_max)
      VALUES (v_club.id::text, _temp_random_bot_name(), v_age, 170+floor(random()*20)::int, CASE WHEN random()>0.3 THEN 'right' ELSE 'left' END, v_pos, 'balanced', 50, 20, 0, 250, 100, 100)
      RETURNING id INTO v_player_id;

      INSERT INTO player_attributes (player_profile_id, aceleracao,acuracia_chute,agilidade,antecipacao,cabeceio,comando_area,controle_bola,coragem,curva,defesa_aerea,desarme,distribuicao_curta,distribuicao_longa,drible,equilibrio,forca,forca_chute,marcacao,passe_alto,passe_baixo,pegada,posicionamento_defensivo,posicionamento_gol,posicionamento_ofensivo,pulo,reflexo,resistencia,saida_gol,stamina,tempo_reacao,tomada_decisao,trabalho_equipe,um_contra_um,um_toque,velocidade,visao_jogo)
      VALUES (v_player_id, 50,50,50,50,50,50,50,50,50,50,50,50,50,50,50,50,50,50,50,50,50,50,50,50,50,50,50,50,50,50,50,50,50,50,50,50);

      INSERT INTO contracts (player_profile_id, club_id, weekly_salary, release_clause, start_date, end_date, status)
      VALUES (v_player_id, v_club.id::text, 250, 2500, now()::date, (now()+interval '1 year')::date, 'active');
    END LOOP;

    RAISE NOTICE 'Club %: had %, added 22 bots', v_club.name, v_current_count;
  END LOOP;
END; $$;

DROP FUNCTION IF EXISTS _temp_random_bot_name();
