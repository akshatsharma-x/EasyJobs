-- Custom migration (W2): India-first relevance. EasyJobs is an India job search, but global ATS boards bring tens of
-- thousands of non-India postings; without a boost the default ranking put e.g. a Ukrainian blue-collar job first.
-- rank_base = posted_epoch/τ + ln(official) + ln(quality) + ln(geo), τ = 14.4 days:
--   geo ×2.0 when a location is in India (≈ 10 days of freshness), ×1.5 for remote roles open worldwide / to India.

CREATE OR REPLACE FUNCTION ej_rank_base(posted_at timestamptz, is_official boolean, quality_score integer, countries text[], is_remote boolean)
RETURNS double precision LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT extract(epoch FROM posted_at) / 1244160.0
    + CASE WHEN is_official THEN ln(1.25) ELSE 0 END
    + ln(0.8 + 0.4 * least(greatest(coalesce(quality_score, 0), 0), 100) / 100.0)
    + CASE
        WHEN 'IN' = ANY(coalesce(countries, '{}')) THEN ln(2.0)
        WHEN is_remote AND coalesce(array_length(countries, 1), 0) = 0 THEN ln(1.5)
        ELSE 0
      END
$$;
--> statement-breakpoint

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
     OR NEW.quality_score IS DISTINCT FROM OLD.quality_score
     OR NEW.countries IS DISTINCT FROM OLD.countries
     OR NEW.is_remote IS DISTINCT FROM OLD.is_remote THEN
    NEW.rank_base := ej_rank_base(NEW.posted_at, NEW.is_official, NEW.quality_score, NEW.countries, NEW.is_remote);
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint

-- Backfill existing rows (the trigger only fires on the columns above, so this assignment sticks).
UPDATE jobs SET rank_base = ej_rank_base(posted_at, is_official, quality_score, countries, is_remote);
