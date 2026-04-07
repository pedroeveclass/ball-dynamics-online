-- ============================================================
-- FORUM TABLES
-- ============================================================

-- 1. Categories (pre-seeded)
CREATE TABLE IF NOT EXISTS public.forum_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.forum_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "forum_categories_public_read" ON public.forum_categories FOR SELECT USING (true);

INSERT INTO public.forum_categories (slug, name, description, sort_order) VALUES
  ('geral',          'Geral',          'Discussões gerais sobre o jogo',            1),
  ('taticas',        'Táticas',        'Estratégias, formações e dicas de jogo',    2),
  ('transferencias', 'Transferências', 'Mercado de transferências e negociações',   3),
  ('sugestoes',      'Sugestões',      'Ideias e sugestões para o jogo',            4),
  ('bugs',           'Bugs',           'Reportar bugs e problemas técnicos',        5),
  ('off-topic',      'Off-topic',      'Assuntos fora do universo FID',             6);

-- 2. Topics
CREATE TABLE IF NOT EXISTS public.forum_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.forum_categories(id),
  author_id UUID NOT NULL REFERENCES public.profiles(id),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 5 AND 150),
  body TEXT NOT NULL CHECK (char_length(body) >= 10),
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  is_locked BOOLEAN NOT NULL DEFAULT false,
  comment_count INT NOT NULL DEFAULT 0,
  like_count INT NOT NULL DEFAULT 0,
  dislike_count INT NOT NULL DEFAULT 0,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_forum_topics_category_activity ON public.forum_topics (category_id, is_pinned DESC, last_activity_at DESC);
CREATE INDEX idx_forum_topics_author ON public.forum_topics (author_id);
CREATE INDEX idx_forum_topics_last_activity ON public.forum_topics (last_activity_at DESC);

ALTER TABLE public.forum_topics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "forum_topics_public_read" ON public.forum_topics FOR SELECT USING (true);
CREATE POLICY "forum_topics_auth_insert" ON public.forum_topics FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);
CREATE POLICY "forum_topics_auth_update" ON public.forum_topics FOR UPDATE TO authenticated USING (auth.uid() = author_id);

-- 3. Comments
CREATE TABLE IF NOT EXISTS public.forum_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES public.forum_topics(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.profiles(id),
  body TEXT NOT NULL CHECK (char_length(body) >= 1),
  like_count INT NOT NULL DEFAULT 0,
  dislike_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_forum_comments_topic ON public.forum_comments (topic_id, created_at ASC);

ALTER TABLE public.forum_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "forum_comments_public_read" ON public.forum_comments FOR SELECT USING (true);
CREATE POLICY "forum_comments_auth_insert" ON public.forum_comments FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = author_id
    AND NOT EXISTS (SELECT 1 FROM public.forum_topics t WHERE t.id = topic_id AND t.is_locked)
  );
CREATE POLICY "forum_comments_auth_update" ON public.forum_comments FOR UPDATE TO authenticated USING (auth.uid() = author_id);

-- 4. Reactions (unified for topics + comments)
CREATE TABLE IF NOT EXISTS public.forum_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  target_type TEXT NOT NULL CHECK (target_type IN ('topic', 'comment')),
  target_id UUID NOT NULL,
  reaction TEXT NOT NULL CHECK (reaction IN ('like', 'dislike')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, target_type, target_id)
);

CREATE INDEX idx_forum_reactions_target ON public.forum_reactions (target_type, target_id);

ALTER TABLE public.forum_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "forum_reactions_public_read" ON public.forum_reactions FOR SELECT USING (true);
CREATE POLICY "forum_reactions_auth_insert" ON public.forum_reactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "forum_reactions_auth_update" ON public.forum_reactions FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "forum_reactions_auth_delete" ON public.forum_reactions FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Comment count + last_activity_at on topic
CREATE OR REPLACE FUNCTION public.forum_comment_count_trigger_fn()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.forum_topics
      SET comment_count = comment_count + 1, last_activity_at = now()
      WHERE id = NEW.topic_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.forum_topics
      SET comment_count = GREATEST(0, comment_count - 1)
      WHERE id = OLD.topic_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER forum_comment_count_trigger
  AFTER INSERT OR DELETE ON public.forum_comments
  FOR EACH ROW EXECUTE FUNCTION public.forum_comment_count_trigger_fn();

-- Reaction count sync
CREATE OR REPLACE FUNCTION public.forum_reaction_count_trigger_fn()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_target_type TEXT;
  v_target_id UUID;
  v_likes INT;
  v_dislikes INT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_target_type := OLD.target_type;
    v_target_id := OLD.target_id;
  ELSE
    v_target_type := NEW.target_type;
    v_target_id := NEW.target_id;
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE reaction = 'like'),
    COUNT(*) FILTER (WHERE reaction = 'dislike')
  INTO v_likes, v_dislikes
  FROM public.forum_reactions
  WHERE target_type = v_target_type AND target_id = v_target_id;

  IF v_target_type = 'topic' THEN
    UPDATE public.forum_topics SET like_count = v_likes, dislike_count = v_dislikes WHERE id = v_target_id;
  ELSIF v_target_type = 'comment' THEN
    UPDATE public.forum_comments SET like_count = v_likes, dislike_count = v_dislikes WHERE id = v_target_id;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER forum_reaction_count_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.forum_reactions
  FOR EACH ROW EXECUTE FUNCTION public.forum_reaction_count_trigger_fn();

-- ============================================================
-- RPC: toggle_forum_reaction
-- ============================================================

CREATE OR REPLACE FUNCTION public.toggle_forum_reaction(
  p_target_type TEXT,
  p_target_id UUID,
  p_reaction TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_existing RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'Não autenticado.');
  END IF;

  SELECT * INTO v_existing
  FROM public.forum_reactions
  WHERE user_id = v_uid AND target_type = p_target_type AND target_id = p_target_id;

  IF FOUND THEN
    IF v_existing.reaction = p_reaction THEN
      -- Same reaction: remove it (un-react)
      DELETE FROM public.forum_reactions WHERE id = v_existing.id;
      RETURN jsonb_build_object('reaction', null);
    ELSE
      -- Different reaction: switch
      UPDATE public.forum_reactions SET reaction = p_reaction WHERE id = v_existing.id;
      RETURN jsonb_build_object('reaction', p_reaction);
    END IF;
  ELSE
    -- No reaction yet: insert
    INSERT INTO public.forum_reactions (user_id, target_type, target_id, reaction)
    VALUES (v_uid, p_target_type, p_target_id, p_reaction);
    RETURN jsonb_build_object('reaction', p_reaction);
  END IF;
END;
$$;
