-- Custom migration: extensions needed before the schema (trigram indexes).
-- Works on Postgres (contrib) and on PGlite (loaded via @electric-sql/pglite/contrib/pg_trgm).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
