-- Custom migration: keep the jobs heap narrow so facet scans touch few pages.
-- Wide values (descriptions, the full search vector, display JSON) move to TOAST once a row exceeds
-- 128 bytes; the columns that filters, facets and ranking read on every matching row stay inline
-- and uncompressed (PLAIN) or inline-compressed (MAIN).
ALTER TABLE jobs SET (toast_tuple_target = 128);
--> statement-breakpoint
ALTER TABLE jobs
  ALTER COLUMN skills SET STORAGE PLAIN,
  ALTER COLUMN cities SET STORAGE PLAIN,
  ALTER COLUMN countries SET STORAGE PLAIN,
  ALTER COLUMN tags SET STORAGE PLAIN,
  ALTER COLUMN company_tags SET STORAGE PLAIN,
  ALTER COLUMN source_ids SET STORAGE PLAIN,
  ALTER COLUMN batches SET STORAGE PLAIN,
  ALTER COLUMN search_head SET STORAGE MAIN,
  ALTER COLUMN title SET STORAGE MAIN,
  ALTER COLUMN company SET STORAGE MAIN;
