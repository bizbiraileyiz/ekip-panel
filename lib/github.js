// GitHub'dan salt okunur kod okuma araçları (iki model de kullanır).
const API = 'https://api.github.com';
const MAX_CHARS = 40000;
const REPO_RE = /^[\w.-]+\/[\w.-]+$/;

export const defaultRepo = () => process.env.GITHUB_DEFAULT_REPO || 'bizbiraileyiz/ekip-panel';

async function gh(path) {
  const headers = { accept: 'application/vnd.github+json', 'user-agent': 'ekip-panel' };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(`${API}${path}`, { headers, signal: AbortSignal.timeout(20000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${data.message || 'hata'}`);
  return data;
}

// Token yoksa API saatte 60 istekle sınırlı (Railway'de IP paylaşımlı olduğu için hızla dolar).
// Bu yüzden açık repolarda önce API dışı adresler kullanılır: raw dosya, .patch, commits.atom.
async function webText(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'ekip-panel' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  return res.text();
}
const hasToken = () => Boolean(process.env.GITHUB_TOKEN);
const branch = (input) => input?.ref || process.env.GITHUB_DEFAULT_BRANCH || 'main';

const cut = (s) => (s.length > MAX_CHARS ? s.slice(0, MAX_CHARS) + `\n…(kısaltıldı, toplam ${s.length} karakter)` : s);
const enc = (p) => p.split('/').map(encodeURIComponent).join('/');

function repoOf(input) {
  const repo = (input?.repo || defaultRepo()).trim();
  if (!REPO_RE.test(repo)) throw new Error('Geçersiz repo adı (sahip/repo olmalı)');
  return repo;
}

const impl = {
  async github_list(input) {
    const repo = repoOf(input);
    const t = await gh(`/repos/${repo}/git/trees/${encodeURIComponent(input?.ref || 'HEAD')}?recursive=1`);
    const files = (t.tree || []).filter((x) => x.type === 'blob').map((x) => `${x.path} (${x.size} B)`);
    return cut(`${repo} – ${files.length} dosya\n${files.slice(0, 500).join('\n')}`);
  },
  async github_read(input) {
    const repo = repoOf(input);
    if (!input?.path) throw new Error('path gerekli');
    if (!hasToken()) {
      try {
        return cut(await webText(`https://raw.githubusercontent.com/${repo}/${encodeURIComponent(input.ref || 'HEAD')}/${enc(input.path)}`));
      } catch {} // özel repo ya da bulunamadı → API dene
    }
    const ref = input.ref ? `?ref=${encodeURIComponent(input.ref)}` : '';
    const f = await gh(`/repos/${repo}/contents/${enc(input.path)}${ref}`);
    if (Array.isArray(f)) return `Bu bir klasör: ${f.map((x) => x.name).join(', ')}`;
    return cut(Buffer.from(f.content || '', 'base64').toString('utf8'));
  },
  async github_commits(input) {
    const repo = repoOf(input);
    const n = Math.min(Math.max(Number(input?.count) || 5, 1), 20);
    if (!hasToken()) {
      try {
        const xml = await webText(`https://github.com/${repo}/commits/${encodeURIComponent(branch(input))}.atom`);
        const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].slice(0, n).map(([, e]) => {
          const sha = (e.match(/Commit\/([0-9a-f]+)/) || [])[1] || '?';
          const date = (e.match(/<updated>([^<]+)/) || [])[1] || '';
          const title = ((e.match(/<title>\s*([^<]*)/) || [])[1] || '').trim();
          return `${sha.slice(0, 7)} | ${date} | ${title}`;
        });
        if (entries.length) return entries.join('\n');
      } catch {}
    }
    const list = await gh(`/repos/${repo}/commits?per_page=${n}`);
    return list.map((c) => `${c.sha.slice(0, 7)} | ${c.commit.author?.date} | ${c.commit.message.split('\n')[0]}`).join('\n');
  },
  async github_commit(input) {
    const repo = repoOf(input);
    if (!hasToken()) {
      try {
        return cut(await webText(`https://github.com/${repo}/commit/${encodeURIComponent(input?.sha || 'HEAD')}.patch`));
      } catch {}
    }
    const c = await gh(`/repos/${repo}/commits/${encodeURIComponent(input?.sha || 'HEAD')}`);
    const files = (c.files || [])
      .map((f) => `### ${f.filename} (${f.status}, +${f.additions} -${f.deletions})\n${f.patch || '(fark gösterilemiyor)'}`)
      .join('\n\n');
    return cut(`${c.sha.slice(0, 7)} – ${c.commit.message}\n\n${files}`);
  },
};

const repoProp = { type: 'string', description: `sahip/repo. Boş bırakılırsa ${'varsayılan'} repo.` };
export const GITHUB_TOOLS = [
  {
    name: 'github_list',
    description: 'GitHub reposundaki tüm dosyaların listesini verir (salt okunur).',
    schema: { type: 'object', properties: { repo: repoProp, ref: { type: 'string', description: 'dal ya da commit (opsiyonel)' } } },
  },
  {
    name: 'github_read',
    description: 'GitHub reposundan bir dosyanın içeriğini okur (salt okunur).',
    schema: {
      type: 'object',
      properties: { repo: repoProp, path: { type: 'string', description: 'dosya yolu, ör. lib/ai.js' }, ref: { type: 'string' } },
      required: ['path'],
    },
  },
  {
    name: 'github_commits',
    description: 'Repodaki son commitleri listeler.',
    schema: { type: 'object', properties: { repo: repoProp, count: { type: 'integer', description: '1-20, varsayılan 5' } } },
  },
  {
    name: 'github_commit',
    description: 'Bir commitin mesajını ve kod farkını (diff) gösterir. Son değişikliği denetlemek için sha boş bırakılır.',
    schema: { type: 'object', properties: { repo: repoProp, sha: { type: 'string', description: 'commit sha; boşsa en son commit' } } },
  },
];

export async function runGithubTool(name, input) {
  const fn = impl[name];
  if (!fn) return `Bilinmeyen araç: ${name}`;
  try {
    return await fn(input || {});
  } catch (e) {
    return `Hata: ${e.message}`;
  }
}
