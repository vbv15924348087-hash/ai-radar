CREATE TABLE sources (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL,
 url_or_identifier TEXT NOT NULL, enabled INTEGER NOT NULL, priority INTEGER NOT NULL,
 metadata TEXT NOT NULL, last_checked_at TEXT, last_error TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE TABLE topics (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL,
 keywords TEXT NOT NULL, weight REAL NOT NULL
);
CREATE TABLE contents (
 id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES sources(id),
 source_type TEXT NOT NULL, external_id TEXT NOT NULL, title TEXT NOT NULL,
 author TEXT NOT NULL, url TEXT NOT NULL, published_at TEXT, raw_content TEXT NOT NULL,
 normalized_content TEXT NOT NULL, language TEXT NOT NULL, fetched_at TEXT NOT NULL,
 canonical_url TEXT NOT NULL, fingerprint TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('pending','processing','completed','failed')),
 attempts INTEGER NOT NULL DEFAULT 0, error TEXT, event_id TEXT
);
CREATE UNIQUE INDEX content_external ON contents(source_id,external_id);
CREATE UNIQUE INDEX content_canonical ON contents(canonical_url);
CREATE UNIQUE INDEX content_fingerprint ON contents(fingerprint);
CREATE TABLE intelligence (
 content_item_id TEXT PRIMARY KEY REFERENCES contents(id), summary TEXT NOT NULL,
 why_it_matters TEXT NOT NULL, key_changes TEXT NOT NULL, product_impact TEXT NOT NULL,
 evidence TEXT NOT NULL, topics TEXT NOT NULL, relevance_score REAL NOT NULL,
 importance_score REAL NOT NULL, novelty_score REAL NOT NULL, source_quality_score REAL NOT NULL,
 final_score REAL NOT NULL, processing_version TEXT NOT NULL, provider TEXT NOT NULL,
 created_at TEXT NOT NULL, favorite INTEGER NOT NULL DEFAULT 0, read INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX intelligence_score ON intelligence(final_score DESC);
CREATE TABLE observations (
 id TEXT PRIMARY KEY, content_item_id TEXT NOT NULL REFERENCES contents(id),
 source_id TEXT NOT NULL REFERENCES sources(id), external_id TEXT NOT NULL,
 url TEXT NOT NULL, raw_content TEXT NOT NULL, observed_at TEXT NOT NULL
);
CREATE UNIQUE INDEX observation_identity ON observations(source_id,external_id);
CREATE TABLE sync_runs (
 id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES sources(id),
 state TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT,
 duration_ms INTEGER NOT NULL, discovered INTEGER NOT NULL, fetched INTEGER NOT NULL,
 duplicates INTEGER NOT NULL, analyzed INTEGER NOT NULL, failed INTEGER NOT NULL,
 ai_duration_ms INTEGER NOT NULL, errors TEXT NOT NULL
);
CREATE INDEX run_started ON sync_runs(started_at DESC);
CREATE TABLE sync_locks (name TEXT PRIMARY KEY, owner TEXT NOT NULL, expires_at INTEGER NOT NULL);
