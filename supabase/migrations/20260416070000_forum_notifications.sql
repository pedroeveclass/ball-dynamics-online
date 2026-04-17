-- ═══════════════════════════════════════════════════════════
-- Forum: notify the topic author and previous commenters when a
-- new comment lands on a topic. Notification links go straight
-- to /forum/t/<topic_id> so clicking the bell opens the thread.
--
-- Rules:
--   * Don't notify the author of the comment itself.
--   * Dedupe by user_id (one notif per person, even if they already
--     commented earlier and the topic author is one of them).
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.forum_comment_notify_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_topic   RECORD;
  v_author  RECORD;
  v_title   TEXT;
  v_body    TEXT;
  v_link    TEXT;
BEGIN
  -- Load topic + commenter profile (for name + title snippet).
  SELECT id, title, author_id INTO v_topic
  FROM public.forum_topics
  WHERE id = NEW.topic_id;

  SELECT username INTO v_author
  FROM public.profiles
  WHERE id = NEW.author_id;

  v_link  := '/forum/t/' || v_topic.id::text;
  v_title := COALESCE(v_author.username, 'Alguém') || ' comentou em "' ||
             (CASE WHEN char_length(v_topic.title) > 60
                   THEN substring(v_topic.title, 1, 57) || '…'
                   ELSE v_topic.title END) || '"';
  v_body  := CASE WHEN char_length(NEW.body) > 140
                  THEN substring(NEW.body, 1, 137) || '…'
                  ELSE NEW.body END;

  -- Notify the topic author + anyone else who already commented on the
  -- topic, minus the commenter themself. DISTINCT dedupes.
  INSERT INTO public.notifications (user_id, type, title, body, link)
  SELECT DISTINCT uid, 'forum', v_title, v_body, v_link
  FROM (
    SELECT v_topic.author_id AS uid
    UNION
    SELECT c.author_id
    FROM public.forum_comments c
    WHERE c.topic_id = NEW.topic_id
      AND c.id <> NEW.id
  ) participants
  WHERE uid IS NOT NULL
    AND uid <> NEW.author_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS forum_comment_notify_trigger ON public.forum_comments;
CREATE TRIGGER forum_comment_notify_trigger
  AFTER INSERT ON public.forum_comments
  FOR EACH ROW EXECUTE FUNCTION public.forum_comment_notify_fn();
