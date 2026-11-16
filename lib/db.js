import pg from 'pg';

const g = globalThis;

function pool() {
  if (!g._ekipPool) {
    g._ekipPool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
      max: 5,
    });
  }
  return g._ekipPool;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  memory TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS memory_version INT NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sender TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_project_idx ON messages(project_id, id);
CREATE TABLE IF NOT EXISTS memory_versions (
  id SERIAL PRIMARY KEY,
  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  pw_fp TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS login_failures (
  id SERIAL PRIMARY KEY,
  ip TEXT NOT NULL,
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_failures_at_idx ON login_failures(at);
CREATE TABLE IF NOT EXISTS usage (
  day DATE NOT NULL,
  provider TEXT NOT NULL,
  calls INT NOT NULL DEFAULT 0,
  input_tokens BIGINT NOT NULL DEFAULT 0,
  output_tokens BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (day, provider)
);
INSERT INTO projects(name) VALUES ('Somborka'), ('Boşnak Tatları'), ('Garanti Soğutma')
ON CONFLICT (name) DO NOTHING;
`;

async function init() {
  try {
    await pool().query(SCHEMA);
  } catch (e) {
    g._ekipReady = null; // bir sonraki istekte tekrar dene
    throw e;
  }
}

export async function q(text, params) {
  if (!g._ekipReady) g._ekipReady = init();
  await g._ekipReady;
  return pool().query(text, params);
}

export async function getProject(id) {
  const r = await q('SELECT id, name, memory, memory_version FROM projects WHERE id = $1', [id]);
  return r.rows[0] || null;
}

export async function addMessage(projectId, sender, content) {
  const r = await q(
    'INSERT INTO messages(project_id, sender, content) VALUES ($1, $2, $3) RETURNING id, project_id, sender, content, created_at',
    [projectId, sender, content]
  );
  return r.rows[0];
}

export async function recentMessages(projectId, limit = 40) {
  const r = await q(
    `SELECT id, sender, content, created_at FROM (
       SELECT * FROM messages WHERE project_id = $1 ORDER BY id DESC LIMIT $2
     ) t ORDER BY id ASC`,
    [projectId, limit]
  );
  return r.rows;
}

// Günlük kullanım: çağrı sayısı ve token
export async function recordUsage(provider, input, output) {
  await q(
    `INSERT INTO usage(day, provider, calls, input_tokens, output_tokens) VALUES (CURRENT_DATE, $1, 1, $2, $3)
     ON CONFLICT (day, provider) DO UPDATE SET calls = usage.calls + 1,
       input_tokens = usage.input_tokens + $2, output_tokens = usage.output_tokens + $3`,
    [provider, input || 0, output || 0]
  );
}

export async function todayUsage() {
  const r = await q('SELECT provider, calls, input_tokens, output_tokens FROM usage WHERE day = CURRENT_DATE');
  const total = r.rows.reduce((s, x) => s + x.calls, 0);
  return { total, byProvider: r.rows };
}
