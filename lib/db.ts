import fs from "node:fs";
import path from "node:path";
import { useTurso } from "./config";

export type Param = string | number | bigint | null;

export interface RunResult {
  changes: number;
  lastInsertRowid: number;
}

/** Minimal async SQL interface implemented by both local SQLite and Turso. */
export interface Db {
  run(sql: string, params?: Param[]): Promise<RunResult>;
  get<T = Record<string, unknown>>(sql: string, params?: Param[]): Promise<T | undefined>;
  all<T = Record<string, unknown>>(sql: string, params?: Param[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,                   -- null for Google-only accounts
  google_sub TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS profiles (
  user_id INTEGER PRIMARY KEY,
  display_name TEXT,
  appearance TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL,              -- 'demo' | 'token' | 'oauth'
  provider TEXT NOT NULL,          -- 'gmail'
  email TEXT NOT NULL,
  label TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expiry INTEGER,
  client_id TEXT,
  client_secret TEXT,
  extra TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  UNIQUE (user_id, email)
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  remote_id TEXT,
  subject TEXT,
  from_name TEXT,
  from_email TEXT,
  to_json TEXT NOT NULL DEFAULT '[]',
  snippet TEXT,
  body_text TEXT,
  body_html TEXT,
  message_date INTEGER,
  read INTEGER NOT NULL DEFAULT 0,
  starred INTEGER NOT NULL DEFAULT 0,
  important INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  trashed INTEGER NOT NULL DEFAULT 0,
  labels TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  UNIQUE (account_id, remote_id)
);
CREATE INDEX IF NOT EXISTS idx_messages_account_date
  ON messages (account_id, message_date DESC);
CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL DEFAULT 'New chat',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  meta TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation
  ON chat_messages (conversation_id, id);
CREATE TABLE IF NOT EXISTS providers (
  user_id INTEGER NOT NULL,
  provider TEXT NOT NULL,
  api_key TEXT NOT NULL,
  base_url TEXT,
  default_model TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, provider)
);
CREATE TABLE IF NOT EXISTS drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  account_id INTEGER NOT NULL,
  message_id INTEGER,
  to_email TEXT,
  to_name TEXT,
  subject TEXT,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'draft',   -- 'draft' | 'sent'
  created_at INTEGER NOT NULL,
  sent_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_drafts_account ON drafts (account_id, status);
CREATE TABLE IF NOT EXISTS pending_oauth (
  state TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`;

import { DatabaseSync } from "node:sqlite";
import { createClient, type Client } from "@libsql/client";

class LocalSqlite implements Db {
  private db: DatabaseSync;
  constructor(file: string) {
    this.db = new DatabaseSync(file);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
  }
  async run(sql: string, params: Param[] = []): Promise<RunResult> {
    const res = this.db.prepare(sql).run(...(params as (string | number | bigint | null)[]));
    return {
      changes: Number(res.changes),
      lastInsertRowid: Number(res.lastInsertRowid ?? 0),
    };
  }
  async get<T>(sql: string, params: Param[] = []): Promise<T | undefined> {
    return this.db.prepare(sql).get(...(params as (string | number | bigint | null)[])) as T | undefined;
  }
  async all<T>(sql: string, params: Param[] = []): Promise<T[]> {
    return this.db.prepare(sql).all(...(params as (string | number | bigint | null)[])) as T[];
  }
  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
  }
}

class TursoSqlite implements Db {
  private client: Client;
  constructor(url: string, token: string) {
    this.client = createClient({ url, authToken: token });
  }
  async run(sql: string, params: Param[] = []): Promise<RunResult> {
    const res = await this.client.execute({ sql, args: params as (string | number | bigint | null)[] });
    return { changes: res.rowsAffected, lastInsertRowid: Number(res.lastInsertRowid ?? 0) };
  }
  async get<T>(sql: string, params: Param[] = []): Promise<T | undefined> {
    const res = await this.client.execute({ sql, args: params as (string | number | bigint | null)[] });
    return res.rows[0] as T | undefined;
  }
  async all<T>(sql: string, params: Param[] = []): Promise<T[]> {
    const res = await this.client.execute({ sql, args: params as (string | number | bigint | null)[] });
    return res.rows as T[];
  }
  async exec(sql: string): Promise<void> {
    await this.client.execute(sql);
  }
}

/** Migrate databases created before Google sign-in existed. */
async function migrate(d: Db): Promise<void> {
  const cols = await d.all<{ name: string; notnull: number }>(
    "PRAGMA table_info(users)"
  );
  if (cols.length === 0) return;
  const hashCol = cols.find((c) => c.name === "password_hash");
  const hasGoogleSub = cols.some((c) => c.name === "google_sub");

  if ((hashCol && hashCol.notnull) || !hasGoogleSub) {
    // Rebuild users with a nullable password_hash + google_sub column.
    await d.exec(
      `CREATE TABLE _users_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT,
        google_sub TEXT,
        created_at INTEGER NOT NULL
      )`
    );
    await d.exec(
      `INSERT INTO _users_new (id, email, password_hash, google_sub, created_at)
       SELECT id, email, password_hash, NULL, created_at FROM users`
    );
    await d.exec("DROP TABLE users");
    await d.exec("ALTER TABLE _users_new RENAME TO users");
  }
  await d.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub
       ON users (google_sub) WHERE google_sub IS NOT NULL`
  );
}

let instance: Db | null = null;

export function db(): Db {
  if (instance) return instance;
  if (useTurso()) {
    instance = new TursoSqlite(
      process.env.TURSO_DATABASE_URL!,
      process.env.TURSO_AUTH_TOKEN!
    );
  } else {
    const dir = path.join(process.cwd(), "data");
    fs.mkdirSync(dir, { recursive: true });
    instance = new LocalSqlite(path.join(dir, "indexpilot.sqlite"));
  }
  return instance;
}

export async function initDb(): Promise<Db> {
  const d = db();
  await d.exec(SCHEMA);
  await migrate(d);
  return d;
}
