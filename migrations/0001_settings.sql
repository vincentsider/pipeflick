-- Phase 1: minimal key/value settings table. Later phases add their own migrations.
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
