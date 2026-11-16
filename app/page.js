'use client';
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const LABEL = { murat: 'Murat', claude: 'Claude', chatgpt: 'ChatGPT', sistem: 'Sistem', codex: 'Codex', dev: 'Dev' };

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

const MAX_FILES = 4;
const MAX_BYTES = 4 * 1024 * 1024;

function readAsBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

// Büyük resimleri tarayıcıda küçült (maliyet ve boyut için)
async function shrinkImage(file) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const max = 2000;
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  if (scale === 1 && file.size < 1.5 * 1024 * 1024) return file;
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
  return blob ? new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
}

function Markdown({ text }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{ a: ({ node, ...p }) => <a {...p} target="_blank" rel="noopener noreferrer" /> }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

function Attachments({ list }) {
  if (!list?.length) return null;
  return (
    <div className="atts">
      {list.map((a) =>
        a.mime.startsWith('image/') ? (
          <a key={a.id} href={`/api/attachments/${a.id}`} target="_blank" rel="noopener noreferrer">
            <img src={`/api/attachments/${a.id}`} alt={a.name} />
          </a>
        ) : (
          <a key={a.id} className="file" href={`/api/attachments/${a.id}`} target="_blank" rel="noopener noreferrer">📄 {a.name}</a>
        )
      )}
    </div>
  );
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
  const [health, setHealth] = useState('');
  const [files, setFiles] = useState([]); // { name, mime, data(base64), preview }
  const [profile, setProfile] = useState(null); // { text, saved, status }
  const [pin, setPin] = useState({ text: '', version: 0, open: true, edit: null, status: '' }); // odanın sabit mesajı
  const fileInput = useRef(null);
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
    setTyping(null);
    setError('');
    const ctrl = new AbortController();
    setPin({ text: '', version: 0, open: true, edit: null, status: '' });
    api(`/api/projects/${pid}/memory`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((r) => pidRef.current === pid && setPin((p) => ({ ...p, text: r.memory || '', version: r.version || 0 })))
      .catch(() => {});
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
    const sentFiles = files;
    if ((!content && !sentFiles.length) || busy || !sentPid) return;
    setBusyPid(sentPid);
    setError('');
    setText('');
    setFiles([]);
    const here = () => pidRef.current === sentPid;
    try {
      const res = await api(`/api/projects/${sentPid}/send`, { method: 'POST', body: JSON.stringify({ content, files: sentFiles.map(({ name, mime, data }) => ({ name, mime, data })) }) });
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
        setFiles(sentFiles);
      }
    } finally {
      if (here()) setTyping(null);
      setBusyPid(null);
    }
  }

  async function addFiles(list) {
    setError('');
    const incoming = [...list].slice(0, MAX_FILES - files.length);
    const out = [];
    for (const f0 of incoming) {
      if (!(f0.type.startsWith('image/') || f0.type === 'application/pdf')) {
        setError(`${f0.name}: sadece resim ve PDF eklenebilir`);
        continue;
      }
      const f = await shrinkImage(f0);
      if (f.size > MAX_BYTES) {
        setError(`${f.name} 4 MB'tan büyük`);
        continue;
      }
      out.push({ name: f.name || 'resim.png', mime: f.type, data: await readAsBase64(f), preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : null });
    }
    if (out.length) setFiles((prev) => [...prev, ...out].slice(0, MAX_FILES));
  }

  function onPaste(e) {
    const imgs = [...(e.clipboardData?.files || [])];
    if (imgs.length) {
      e.preventDefault();
      addFiles(imgs);
    }
  }

  async function savePin() {
    setPin((p) => ({ ...p, status: 'Kaydediliyor…' }));
    const res = await api(`/api/projects/${pid}/memory`, { method: 'PUT', body: JSON.stringify({ memory: pin.edit, version: pin.version }) });
    const r = await res.json();
    if (res.status === 409) return setPin((p) => ({ ...p, text: r.memory, version: r.version, status: 'Başka yerde değişmiş, güncel hali yüklendi.' }));
    setPin((p) => ({ ...p, text: p.edit, version: r.version, edit: null, status: '' }));
  }

  async function openProfile() {
    if (profile) return setProfile(null);
    const r = await api('/api/settings').then((r) => r.json());
    setProfile({ text: r.profile || '', saved: r.profile || '', status: '' });
  }

  async function saveProfile() {
    setProfile((p) => ({ ...p, status: 'Kaydediliyor…' }));
    await api('/api/settings', { method: 'PUT', body: JSON.stringify({ profile: profile.text }) });
    setProfile((p) => ({ ...p, saved: p.text, status: 'Kaydedildi' }));
  }


  async function newProject() {
    const name = prompt('Yeni oda adı');
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
      const note = (x) => (x.reply?.includes('araçları bu çağrıda kullanılamadı') ? ' (ama web/kod araçları hata verdi: ' + x.reply.split('kullanılamadı:')[1] : '');
      const line = (n, x) => `${n} (${x.model}): ${x.ok ? 'çalışıyor' + note(x) : 'HATA – ' + x.error}`;
      setHealth(`${line('Claude', r.claude)}\n${line('ChatGPT', r.chatgpt)}\nBugünkü çağrı: ${r.usage.total}/${r.usage.limit}`);
    } catch (e) {
      setHealth(`Test başarısız: ${e.message}`);
    }
  }

  const current = projects.find((p) => p.id === pid);

  async function toggleAuto() {
    if (!current) return;
    const res = await api(`/api/projects/${pid}`, { method: 'PATCH', body: JSON.stringify({ auto_reply: !current.auto_reply }) });
    const r = await res.json();
    if (res.ok) setProjects((prev) => prev.map((p) => (p.id === r.id ? r : p)));
  }

  async function deleteProject() {
    const name = projects.find((p) => p.id === pid)?.name || '';
    if (!confirm(`"${name}" odası silinsin mi?\nTüm mesajları kalıcı olarak silinir. Geri alınamaz.`)) return;
    const res = await api(`/api/projects/${pid}`, { method: 'DELETE' });
    const r = await res.json();
    if (!res.ok) return setError(r.error || 'Silinemedi');
    setProjects(r);
    setPid(r[0]?.id ?? null);
  }

  async function clearChat() {
    if (!confirm('Bu projenin tüm mesajları kalıcı olarak silinsin mi?\nGeri alınamaz. Sabit mesaj ve Hakkımda kalır.')) return;
    const res = await api(`/api/projects/${pid}/clear`, { method: 'POST' });
    const r = await res.json();
    if (!res.ok) return setError(r.error || 'Temizlenemedi');
    setMessages([]);
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
        <button className="btn" onClick={newProject} title="Yeni oda">+</button>
        <button className="btn" onClick={deleteProject} disabled={busy} title="Bu odayı sil">−</button>
        <button className="btn" onClick={openProfile} title="Tüm projelerde ortak bilgi">Hakkımda</button>
        {current && (
          <button className="btn" onClick={toggleAuto} title="Bu odada paneldeki Claude ve ChatGPT otomatik cevap versin mi?">
            {current.auto_reply ? 'Otomatik cevap: açık' : 'Otomatik cevap: kapalı'}
          </button>
        )}
        {!pin.text && pin.edit === null && (
          <button className="btn" onClick={() => setPin((p) => ({ ...p, edit: '', open: true }))} title="Odaya sabit mesaj ekle">📌</button>
        )}
        <button className="btn" onClick={clearChat} disabled={busy} title="Sohbeti temizle">Temizle</button>
        <button className="btn" onClick={() => (health ? setHealth('') : testConnection())} title="Bağlantı testi">Test</button>
        <button className="btn" onClick={logout} title="Çıkış">⎋</button>
      </div>

      {health && <div className="memory hint" style={{ whiteSpace: 'pre-wrap' }}>{health}</div>}

      {profile && (
        <div className="memory">
          <div className="hint" style={{ marginBottom: 6 }}>Murat hakkında – tüm projelerde ikisi de okur</div>
          <textarea value={profile.text} onChange={(e) => setProfile((p) => ({ ...p, text: e.target.value }))} placeholder="Kim olduğun, işlerin, tercihlerin…" />
          <div className="row">
            <button className="btn primary" onClick={saveProfile} disabled={profile.text === profile.saved}>Kaydet</button>
            <span className="hint">{profile.status}</span>
          </div>
        </div>
      )}

      {(pin.text || pin.edit !== null) && (
        <div className="pin">
          <div className="pinbar">
            <button type="button" className="pintitle" onClick={() => setPin((p) => ({ ...p, open: !p.open }))}>
              📌 Sabit mesaj {pin.open ? '▾' : '▸'}
            </button>
            {pin.edit === null ? (
              <button type="button" className="btn" onClick={() => setPin((p) => ({ ...p, edit: p.text, open: true }))}>Düzenle</button>
            ) : (
              <>
                <button type="button" className="btn primary" onClick={savePin}>Kaydet</button>
                <button type="button" className="btn" onClick={() => setPin((p) => ({ ...p, edit: null, status: '' }))}>Vazgeç</button>
              </>
            )}
            <span className="hint">{pin.status}</span>
          </div>
          {pin.open &&
            (pin.edit !== null ? (
              <textarea value={pin.edit} onChange={(e) => setPin((p) => ({ ...p, edit: e.target.value }))} />
            ) : (
              <div className="pinbody"><Markdown text={pin.text} /></div>
            ))}
        </div>
      )}

      <div className="msgs">
        {!messages.length && <div className="empty">Henüz mesaj yok. Etiketsiz mesaja ikisi sırayla cevap verir; @claude ya da @gpt yazarsan sadece o cevap verir.</div>}
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.sender}`}>
            {m.sender !== 'murat' && <div className="who">{LABEL[m.sender] || m.sender}</div>}
            {m.sender === 'sistem' ? m.content : <Markdown text={m.content} />}
            <Attachments list={m.attachments} />
          </div>
        ))}
        {typing && busyPid === pid && <div className="typing">{LABEL[typing]} yazıyor…</div>}
        <div ref={endRef} />
      </div>

      <div className="compose">
        {error && <div className="err">{error}</div>}
        {busy && busyPid !== pid && <div className="hint">Başka bir projede cevap bekleniyor…</div>}
        {files.length > 0 && (
          <div className="pending">
            {files.map((f, i) => (
              <span key={i} className="chipfile">
                {f.preview ? <img src={f.preview} alt="" /> : '📄'} {f.name}
                <button type="button" onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} title="Kaldır">×</button>
              </span>
            ))}
          </div>
        )}
        <form
          onSubmit={send}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            addFiles(e.dataTransfer.files);
          }}
        >
          <input ref={fileInput} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
          <button type="button" className="btn" onClick={() => fileInput.current?.click()} title="Resim ya da PDF ekle" disabled={files.length >= MAX_FILES}>📎</button>
          <textarea
            onPaste={onPaste}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.innerWidth > 700) send(e);
            }}
            placeholder={busy ? 'Cevap bekleniyor…' : 'Mesaj yaz'}
            rows={2}
          />
          <button className="btn primary" disabled={busy || (!text.trim() && !files.length)}>Gönder</button>
        </form>
      </div>
    </div>
  );
}
