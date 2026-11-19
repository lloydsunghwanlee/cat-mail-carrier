// 저장소: Node 내장 SQLite (추가 설치 없음). DATA_DIR 환경변수 폴더에 game.db 파일로 저장.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export function openDb(dir) {
  let file = ':memory:';
  if (dir) { mkdirSync(dir, { recursive: true }); file = join(dir, 'game.db'); }
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY, started_at INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0, ip TEXT);
    CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT UNIQUE, name TEXT NOT NULL, score INTEGER NOT NULL,
      stage INTEGER NOT NULL, level INTEGER NOT NULL, letters INTEGER NOT NULL, cleared INTEGER NOT NULL,
      version TEXT, created_at INTEGER NOT NULL, hidden INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS scores_rank ON scores(hidden, score DESC);
    CREATE INDEX IF NOT EXISTS scores_time ON scores(created_at);
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, data TEXT, session TEXT, version TEXT, created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS events_name ON events(name, created_at);
    CREATE TABLE IF NOT EXISTS errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, msg TEXT, stack TEXT, ua TEXT, url TEXT, session TEXT, version TEXT, created_at INTEGER NOT NULL);
  `);
  const q = {
    insertRun: db.prepare('INSERT INTO runs (id, started_at, ip) VALUES (?, ?, ?)'),
    getRun: db.prepare('SELECT * FROM runs WHERE id = ?'),
    useRun: db.prepare('UPDATE runs SET used = 1 WHERE id = ? AND used = 0'),
    insertScore: db.prepare(`INSERT INTO scores (run_id, name, score, stage, level, letters, cleared, version, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    rankOf: db.prepare('SELECT COUNT(*) + 1 AS rank FROM scores WHERE hidden = 0 AND score > ? AND created_at >= ?'),
    top: db.prepare(`SELECT id, name, score, stage, level, cleared, created_at FROM scores
      WHERE hidden = 0 AND created_at >= ? ORDER BY score DESC, created_at ASC LIMIT ?`),
    hide: db.prepare('UPDATE scores SET hidden = ? WHERE id = ?'),
    insertEvent: db.prepare('INSERT INTO events (name, data, session, version, created_at) VALUES (?, ?, ?, ?, ?)'),
    insertError: db.prepare('INSERT INTO errors (kind, msg, stack, ua, url, session, version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
    eventCounts: db.prepare(`SELECT name, json_extract(data, '$.stage') AS stage, COUNT(*) AS n FROM events
      WHERE created_at >= ? GROUP BY name, stage ORDER BY name, stage`),
    recentErrors: db.prepare('SELECT kind, msg, version, created_at FROM errors ORDER BY id DESC LIMIT 20'),
    errorCount: db.prepare('SELECT COUNT(*) AS n FROM errors WHERE created_at >= ?'),
    scoreCount: db.prepare('SELECT COUNT(*) AS n FROM scores'),
    pruneRuns: db.prepare('DELETE FROM runs WHERE started_at < ?'),
    pruneEvents: db.prepare('DELETE FROM events WHERE created_at < ?'),
    pruneErrors: db.prepare('DELETE FROM errors WHERE created_at < ?'),
  };
  return { db, q, close: () => db.close() };
}
