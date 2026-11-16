'use client';
import { useEffect, useRef, useState } from 'react';

const LABEL = { murat: 'Murat', claude: 'Claude', chatgpt: 'ChatGPT', sistem: 'Sistem' };

function store(key, val) {
  try {
    if (val === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, val);
  } catch {}
}

// Oturum düşerse giriş sayfasına git
async function api(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: opts.body ? { 'content-type': 'application/json', ...opts.headers } : opts.headers,
  });
  if (res.status === 401) {
    window.location.href = '/login';
    throw new Error('Giriş gerekli');
  }
  return res;
}

function mergeMessages(prev, incoming) {
  const seen = new Set(prev.map((m) => m.id));
  const add = incoming.filter((m) => !seen.has(m.id));
  return add.length ? [...prev, ...add].sort((a, b) => a.id - b.id) : prev;
}

export default function Panel() {
  const [projects, setProjects] = useState([]);
  const [pid, setPid] = useState(null);
  const pidRef = useRef(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [busyPid, setBusyPid] = useState(null); // cevap beklenen proje
  const [typing, setTyping] = useState(null);
  const [error, setError] = useState('');
  const [mem, setMem] = useState(null); // { text, version, saved, history, draft, status }
  const [health, setHealth] = useState('');
  const endRef = useRef(null);
  const lastId = messages.length ? messages[messages.length - 1].id : 0;
  const busy = busyPid !== null;

  useEffect(() => {
    api('/api/projects')
      .then((r) => r.json())
      .then((list) => {
        setProjects(list);
        const saved = Number(store('ekip_pid'));
        setPid(list.find((p) => p.id === saved) ? saved : list[0]?.id ?? null);
      })
      .catch(() => setError('Projeler yüklenemedi'));
  }, []);

  // Proje değişince: eski istekleri iptal et, sadece bu projenin verisini göster
  useEffect(() => {
    pidRef.current = pid;
    if (!pid) return;
    store('ekip_pid', String(pid));
    setMessages([]);
    setMem(null);
    setTyping(null);
    setError('');
    const ctrl = new AbortController();
    api(`/api/projects/${pid}/messages`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((rows) => pidRef.current === pid && Array.isArray(rows) && setMessages(rows))
      .catch(() => {});
    return () => ctrl.abort();
  }, [pid]);

  // Diğer cihazdan gelen mesajlar için hafif senkron
  useEffect(() => {
    if (!pid || busyPid === pid) return;
    const ctrl = new AbortController();
    const t = setInterval(() => {
      api(`/api/projects/${pid}/messages?after=${lastId}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((rows) => pidRef.current === pid && Array.isArray(rows) && setMessages((prev) => mergeMessages(prev, rows)))
        .catch(() => {});
    }, 5000);
    return () => {
      clearInterval(t);
      ctrl.abort();
    };
  }, [pid, busyPid, lastId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);

  async function send(e) {
    e?.preventDefault();
    const content = text.trim();
    const sentPid = pid;
    if (!content || busy || !sentPid) return;
    setBusyPid(sentPid);
    setError('');
    setText('');
    const here = () => pidRef.current === sentPid;
    try {
      const res = await api(`/api/projects/${sentPid}/send`, { method: 'POST', body: JSON.stringify({ content }) });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error || 'Gönderilemedi');
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (!line || !here()) continue; // başka projeye geçildiyse bu ekrana yazma
          const ev = JSON.parse(line);
          if (ev.type === 'typing') setTyping(ev.who);
          if (ev.type === 'message' && ev.message.project_id === sentPid) {
            setTyping(null);
            setMessages((prev) => mergeMessages(prev, [ev.message]));
          }
          if (ev.type === 'error') setError(ev.error);
        }
      }
    } catch (err) {
      if (here()) {
        setError(err.message);
        setText(content);
      }
    } finally {
      if (here()) setTyping(null);
      setBusyPid(null);
    }
  }

  async function loadMemory(status = '') {
    const r = await api(`/api/projects/${pid}/memory`).then((r) => r.json());
    if (pidRef.current !== pid) return;
    setMem({ text: r.memory || '', saved: r.memory || '', version: r.version, history: r.history || [], draft: false, status });
  }

  async function saveMemory() {
    setMem((m) => ({ ...m, status: 'Kaydediliyor…' }));
    const res = await api(`/api/projects/${pid}/memory`, {
      method: 'PUT',
      body: JSON.stringify({ memory: mem.text, version: mem.version }),
    });
    const r = await res.json();
    if (res.status === 409) {
      setMem((m) => ({ ...m, text: r.memory, saved: r.memory, version: r.version, draft: false, status: r.error }));
      return;
    }
    await loadMemory('Kaydedildi');
  }

  async function askDraft() {
    setMem((m) => ({ ...m, status: 'Claude taslak hazırlıyor…' }));
    const r = await api(`/api/projects/${pid}/memory/refresh`, { method: 'POST' }).then((r) => r.json());
    if (pidRef.current !== pid) return;
    if (r.error) return setMem((m) => ({ ...m, status: `Hata: ${r.error}` }));
    setMem((m) => ({ ...m, text: r.draft, draft: true, status: 'Taslak. Kontrol et; "Onayla ve kaydet" demeden kaydedilmez.' }));
  }

  function loadVersion(id) {
    const v = mem.history.find((h) => h.id === Number(id));
    if (v) setMem((m) => ({ ...m, text: v.content, draft: true, status: 'Eski sürüm yüklendi. Kaydedersen güncel kayıt bu olur.' }));
  }

  async function newProject() {
    const name = prompt('Yeni proje adı');
    if (!name?.trim()) return;
    const p = await api('/api/projects', { method: 'POST', body: JSON.stringify({ name }) }).then((r) => r.json());
    if (p.id) {
      setProjects((prev) => (prev.find((x) => x.id === p.id) ? prev : [...prev, p]));
      setPid(p.id);
    }
  }

  async function testConnection() {
    setHealth('Test ediliyor…');
    try {
      const r = await api('/api/health', { method: 'POST' }).then((r) => r.json());
      const line = (n, x) => `${n} (${x.model}): ${x.ok ? 'çalışıyor' : 'HATA – ' + x.error}`;
      setHealth(`${line('Claude', r.claude)}\n${line('ChatGPT', r.chatgpt)}\nBugünkü çağrı: ${r.usage.total}/${r.usage.limit}`);
    } catch (e) {
      setHealth(`Test başarısız: ${e.message}`);
    }
  }

  async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  return (
    <div className="app">
      <div className="top">
        <select value={pid ?? ''} onChange={(e) => setPid(Number(e.target.value))}>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <button className="btn" onClick={newProject} title="Yeni proje">+</button>
        <button className="btn" onClick={() => (mem ? setMem(null) : loadMemory())}>Karar kaydı</button>
        <button className="btn" onClick={() => (health ? setHealth('') : testConnection())} title="Bağlantı testi">Test</button>
        <button className="btn" onClick={logout} title="Çıkış">⎋</button>
      </div>

      {health && <div className="memory hint" style={{ whiteSpace: 'pre-wrap' }}>{health}</div>}

      {mem && (
        <div className="memory">
          {mem.draft && <div className="draft">TASLAK – henüz kaydedilmedi</div>}
          <textarea
            value={mem.text}
            onChange={(e) => setMem((m) => ({ ...m, text: e.target.value }))}
            placeholder="Kesin kararlar, devam eden işler, açık sorunlar…"
          />
          <div className="row">
            <button className="btn primary" onClick={saveMemory} disabled={mem.text === mem.saved && !mem.draft}>
              {mem.draft ? 'Onayla ve kaydet' : 'Kaydet'}
            </button>
            {mem.draft ? (
              <button className="btn" onClick={() => setMem((m) => ({ ...m, text: m.saved, draft: false, status: 'Vazgeçildi' }))}>Vazgeç</button>
            ) : (
              <button className="btn" onClick={askDraft}>Claude'dan taslak iste</button>
            )}
            {mem.history.length > 0 && (
              <select className="btn" value="" onChange={(e) => loadVersion(e.target.value)}>
                <option value="">Geçmiş</option>
                {mem.history.map((h) => (
                  <option key={h.id} value={h.id}>{new Date(h.created_at).toLocaleString('tr-TR')}</option>
                ))}
              </select>
            )}
            <span className="hint">{mem.status || 'İkisi de her cevapta bu kaydı okur.'}</span>
          </div>
        </div>
      )}

      <div className="msgs">
        {!messages.length && <div className="empty">Henüz mesaj yok. Yazdığın her mesaja önce Claude, sonra ChatGPT cevap verir.</div>}
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.sender}`}>
            {m.sender !== 'murat' && <div className="who">{LABEL[m.sender] || m.sender}</div>}
            {m.content}
          </div>
        ))}
        {typing && busyPid === pid && <div className="typing">{LABEL[typing]} yazıyor…</div>}
        <div ref={endRef} />
      </div>

      <div className="compose">
        {error && <div className="err">{error}</div>}
        {busy && busyPid !== pid && <div className="hint">Başka bir projede cevap bekleniyor…</div>}
        <form onSubmit={send}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.innerWidth > 700) send(e);
            }}
            placeholder={busy ? 'Cevap bekleniyor…' : 'Mesaj yaz'}
            rows={2}
          />
          <button className="btn primary" disabled={busy || !text.trim()}>Gönder</button>
        </form>
      </div>
    </div>
  );
}
