-- Custom migration: full-text search maintenance + sort indexes that drizzle-kit cannot express.

-- Token normalisation shared by documents (here) and queries (src/search/text.ts mirrors it; parity is tested).
-- Postgres regex: \m = start of word, \M = end of word.
CREATE OR REPLACE FUNCTION ej_search_norm(s text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
    lower(coalesce(s, '')),
    'c\+\+', ' cpp ', 'g'),
    '\mc#', ' csharp ', 'g'),
    '\mf#', ' fsharp ', 'g'),
    '\.net\M', ' dotnet ', 'g'),
    '([a-z0-9]+)\.js\M', '\1js \1', 'g')
$$;
--> statement-breakpoint

-- search      = title A · company A · skills B · meta + english title stems C · description D
-- search_head = the same without the description (small, inline → cheap ts_rank)
-- rank_base   = posted_epoch/τ + ln(official boost) + ln(quality boost), τ = 14.4 days (half-life 10 days).
--               ORDER BY rank_base gives exactly the order of exp(-age/τ) × boosts at any point in time.
CREATE OR REPLACE FUNCTION jobs_search_refresh() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT'
     OR NEW.search IS NULL
     OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.company IS DISTINCT FROM OLD.company
     OR NEW.skills IS DISTINCT FROM OLD.skills
     OR NEW.search_meta IS DISTINCT FROM OLD.search_meta
     OR NEW.description_text IS DISTINCT FROM OLD.description_text THEN
    NEW.search_head :=
         setweight(to_tsvector('simple', ej_search_norm(NEW.title)), 'A')
      || setweight(to_tsvector('simple', ej_search_norm(NEW.company)), 'A')
      || setweight(to_tsvector('simple', ej_search_norm(array_to_string(NEW.skills, ' , '))), 'B')
      || setweight(to_tsvector('simple', ej_search_norm(NEW.search_meta)), 'C')
      || setweight(to_tsvector('english', ej_search_norm(NEW.title)), 'C');
    NEW.search := NEW.search_head
      || setweight(to_tsvector('english', ej_search_norm(left(coalesce(NEW.description_text, ''), 20000))), 'D');
  END IF;
  IF TG_OP = 'INSERT'
     OR NEW.posted_at IS DISTINCT FROM OLD.posted_at
     OR NEW.is_official IS DISTINCT FROM OLD.is_official
     OR NEW.quality_score IS DISTINCT FROM OLD.quality_score THEN
    NEW.rank_base := extract(epoch FROM NEW.posted_at) / 1244160.0
      + CASE WHEN NEW.is_official THEN ln(1.25) ELSE 0 END
      + ln(0.8 + 0.4 * least(greatest(NEW.quality_score, 0), 100) / 100.0);
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER jobs_search_refresh BEFORE INSERT OR UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION jobs_search_refresh();
--> statement-breakpoint

-- relevance (no q): ORDER BY rank_base DESC, id
CREATE INDEX IF NOT EXISTS jobs_open_rank_idx ON jobs (rank_base DESC, id) WHERE status = 'open';
--> statement-breakpoint
-- salary: ORDER BY coalesce(max, min) DESC NULLS LAST
CREATE INDEX IF NOT EXISTS jobs_open_salary_idx ON jobs ((coalesce(salary_inr_yearly_max, salary_inr_yearly_min)) DESC NULLS LAST, rank_base DESC)
  WHERE status = 'open';
--> statement-breakpoint
-- Leave room on each page so the frequent last_seen_at refreshes can be HOT updates (no index churn).
ALTER TABLE jobs SET (fillfactor = 85);
