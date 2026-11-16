// Sunucudaki görünmez tarayıcı (Chromium). İki model de kullanır.
// - Her yerde: sayfa açma, kaydırma, geri gitme, ekran görüntüsü (sadece bakma).
// - TEST_SITES içindeki sitelerde ayrıca: tıklama ve yazma (fonksiyonel test).
// - İç ağ / özel IP adresleri engellidir; dosya indirme kapalıdır.
import { chromium } from 'playwright-core';
import dns from 'node:dns/promises';
import net from 'node:net';

const g = globalThis;
const NAV_TIMEOUT = 30000;
const TEXT_LIMIT = 8000;

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  const l = ip.toLowerCase();
  if (l.startsWith('::ffff:')) return isPrivateIp(l.slice(7));
  return l === '::' || l === '::1' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80');
}

const hostCache = new Map(); // host -> { ok, at }
async function hostAllowed(host) {
  host = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (net.isIP(host)) return !isPrivateIp(host);
  if (host === 'localhost' || /\.(local|localhost|internal|railway\.internal)$/.test(host)) return false;
  const c = hostCache.get(host);
  if (c && Date.now() - c.at < 60000) return c.ok;
  let ok = false;
  try {
    const addrs = await dns.lookup(host, { all: true });
    ok = addrs.length > 0 && addrs.every((a) => !isPrivateIp(a.address));
  } catch {}
  hostCache.set(host, { ok, at: Date.now() });
  return ok;
}

// Claude artifact içerikleri bu alan adındaki çerçevede çalışır; test için varsayılan açık.
const DEFAULT_TEST_SITES = ['claudeusercontent.com'];

export const testSites = () =>
  [...DEFAULT_TEST_SITES, ...(process.env.TEST_SITES || '').split(',')].map((s) => s.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')).filter(Boolean);

function interactionAllowed(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return testSites().some((s) => host === s || host.endsWith('.' + s));
  } catch {
    return false;
  }
}

async function getBrowser() {
  if (g._ekipBrowser) {
    const b = await g._ekipBrowser.catch(() => null);
    if (b?.isConnected()) return b;
  }
  g._ekipBrowser = chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  return g._ekipBrowser;
}

const DEVICES = {
  desktop: { viewport: { width: 1280, height: 800 } },
  mobile: {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  },
};

// Bir model cevabı boyunca yaşayan tarayıcı oturumu (cevap bitince kapanır).
export class BrowserSession {
  constructor() {
    this.ctx = null;
    this.page = null;
    this.device = null;
  }

  async ensure(device = 'desktop') {
    if (this.page && this.device === device) return;
    await this.close();
    const browser = await getBrowser();
    this.ctx = await browser.newContext({ ...DEVICES[device], acceptDownloads: false, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    await this.ctx.route('**/*', async (route) => {
      let u;
      try {
        u = new URL(route.request().url());
      } catch {
        return route.abort();
      }
      if (u.protocol === 'data:' || u.protocol === 'blob:') return route.continue();
      if (!['http:', 'https:'].includes(u.protocol)) return route.abort();
      if (!(await hostAllowed(u.hostname))) return route.abort('blockedbyclient');
      return route.continue();
    });
    this.page = await this.ctx.newPage();
    this.page.setDefaultTimeout(NAV_TIMEOUT);
    this.page.on('dialog', (d) => d.dismiss().catch(() => {}));
    this.device = device;
  }

  async close() {
    try {
      await this.ctx?.close();
    } catch {}
    this.ctx = null;
    this.page = null;
  }

  async settle() {
    await this.page.waitForLoadState('domcontentloaded').catch(() => {});
    await this.page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  }

  // Sayfanın (ve içindeki çerçevelerin) metni + tıklanabilir öğe listesi + ekran görüntüsü
  async snapshot(note = '') {
    const page = this.page;
    this.eidFrame = new Map();
    const elements = [];
    const texts = [];
    let next = 1;
    for (const frame of page.frames()) {
      if (frame.isDetached()) continue;
      const furl = frame.url();
      if (!/^https?:/.test(furl)) continue;
      const res = await frame
        .evaluate((start) => {
          const sel = 'a[href],button,input,select,textarea,summary,[role=button],[role=link],[role=tab],[role=menuitem],[role=checkbox],[role=radio],[onclick],[contenteditable=true]';
          const out = [];
          let n = start;
          for (const el of document.querySelectorAll(sel)) {
            const r = el.getBoundingClientRect();
            const st = getComputedStyle(el);
            if (r.width < 2 || r.height < 2 || st.visibility === 'hidden' || st.display === 'none') continue;
            if (n - start >= 150) break;
            el.setAttribute('data-eid', String(n));
            const tag = el.tagName.toLowerCase();
            const role = el.getAttribute('role') || '';
            const type = el.getAttribute('type') || '';
            const name = (el.getAttribute('aria-label') || el.innerText || el.value || el.getAttribute('placeholder') || el.getAttribute('title') || el.getAttribute('alt') || el.getAttribute('name') || '')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 80);
            const href = tag === 'a' ? ` → ${el.getAttribute('href')?.slice(0, 80)}` : '';
            out.push({ n, line: `[${n}] ${tag}${role ? '/' + role : ''}${type ? '(' + type + ')' : ''} "${name}"${href}` });
            n++;
          }
          const text = (document.body?.innerText || '').trim();
          return { out, next: n, text };
        }, next)
        .catch(() => null);
      if (!res) continue;
      for (const e of res.out) {
        this.eidFrame.set(e.n, frame);
        elements.push(e.line);
      }
      next = res.next;
      if (res.text) texts.push(frame === page.mainFrame() ? res.text : `--- çerçeve: ${new URL(furl).hostname} ---\n${res.text}`);
    }
    const text = texts.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
    const shot = await page.screenshot({ type: 'jpeg', quality: 60 }).catch(() => null);
    const canAct = page.frames().some((f) => interactionAllowed(f.url()));
    const summary = [
      note,
      `URL: ${page.url()}`,
      `Başlık: ${await page.title().catch(() => '')}`,
      `Görünüm: ${this.device === 'mobile' ? 'mobil (390×844)' : 'masaüstü (1280×800)'}`,
      `Etkileşim: ${canAct ? 'AÇIK (test sitesindeki öğelerde tıklama/yazma serbest)' : 'KAPALI (bu sitede sadece bakma)'}`,
      '',
      `Sayfa metni${text.length > TEXT_LIMIT ? ' (kısaltıldı)' : ''}:`,
      text.slice(0, TEXT_LIMIT) || '(metin yok)',
      '',
      'Öğeler (tıklama/yazma için id):',
      elements.join('\n') || '(yok)',
    ].join('\n');
    return { text: summary, image: shot ? shot.toString('base64') : null };
  }

  requirePage() {
    if (!this.page) throw new Error('Önce browser_open ile bir sayfa aç.');
  }

  requireInteraction(id) {
    this.requirePage();
    const frame = this.eidFrame?.get(Number(id)) || this.page.mainFrame();
    if (!interactionAllowed(frame.url())) {
      const list = testSites().join(', ') || '(liste boş)';
      throw new Error(`Bu sitede sadece bakma izni var. Tıklama/yazma sadece şu sitelerde açık: ${list}`);
    }
  }

  el(id) {
    const frame = this.eidFrame?.get(Number(id));
    if (!frame) throw new Error(`[${id}] bulunamadı; sayfa değişmiş olabilir, güncel öğe listesine bak.`);
    return frame.locator(`[data-eid="${Number(id)}"]`).first();
  }
}

const impl = {
  async browser_open(s, { url, device }) {
    let u;
    try {
      u = new URL(/^https?:\/\//i.test(url || '') ? url : `https://${url}`);
    } catch {
      throw new Error('Geçersiz adres');
    }
    if (!(await hostAllowed(u.hostname))) throw new Error('Bu adres engelli (iç ağ ya da çözümlenemeyen alan adı).');
    await s.ensure(device === 'mobile' ? 'mobile' : 'desktop');
    const res = await s.page.goto(u.toString(), { waitUntil: 'domcontentloaded' });
    await s.settle();
    if (s.page.frames().length > 1) await s.page.waitForTimeout(2500); // gömülü çerçeveler (ör. artifact) için
    return s.snapshot(res ? `HTTP ${res.status()}` : '');
  },
  async browser_click(s, { id }) {
    s.requireInteraction(id);
    await s.el(id).click({ timeout: 10000 });
    await s.settle();
    return s.snapshot(`[${id}] tıklandı.`);
  },
  async browser_type(s, { id, text, enter }) {
    s.requireInteraction(id);
    const el = s.el(id);
    await el.fill(String(text ?? ''), { timeout: 10000 });
    if (enter) await el.press('Enter');
    await s.settle();
    return s.snapshot(`[${id}] alanına yazıldı${enter ? ' ve Enter basıldı' : ''}.`);
  },
  async browser_select(s, { id, value }) {
    s.requireInteraction(id);
    await s.el(id).selectOption(String(value ?? ''), { timeout: 10000 });
    await s.settle();
    return s.snapshot(`[${id}] seçildi: ${value}`);
  },
  async browser_scroll(s, { direction }) {
    s.requirePage();
    const vp = s.page.viewportSize() || { width: 800, height: 600 };
    await s.page.mouse.move(vp.width / 2, vp.height / 2);
    await s.page.mouse.wheel(0, direction === 'up' ? -700 : 700);
    await s.page.waitForTimeout(400);
    return s.snapshot(`Kaydırıldı (${direction === 'up' ? 'yukarı' : 'aşağı'}).`);
  },
  async browser_back(s) {
    s.requirePage();
    await s.page.goBack().catch(() => {});
    await s.settle();
    return s.snapshot('Geri gidildi.');
  },
};

export const BROWSER_TOOLS = [
  {
    name: 'browser_open',
    description: 'Gerçek bir tarayıcıda (JavaScript çalışır) sayfayı açar. Sayfa metnini, tıklanabilir öğe listesini ve ekran görüntüsünü döndürür. device: "desktop" ya da "mobile" (telefon görünümü).',
    schema: {
      type: 'object',
      properties: { url: { type: 'string' }, device: { type: 'string', enum: ['desktop', 'mobile'] } },
      required: ['url'],
    },
  },
  {
    name: 'browser_click',
    description: 'Sayfadaki öğeye tıklar (id, öğe listesindeki numara). Sadece test sitelerinde çalışır.',
    schema: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
  },
  {
    name: 'browser_type',
    description: 'Bir giriş alanına yazar; enter=true ise ardından Enter basar. Sadece test sitelerinde çalışır.',
    schema: {
      type: 'object',
      properties: { id: { type: 'integer' }, text: { type: 'string' }, enter: { type: 'boolean' } },
      required: ['id', 'text'],
    },
  },
  {
    name: 'browser_select',
    description: 'Açılır listeden (select) değer seçer. Sadece test sitelerinde çalışır.',
    schema: { type: 'object', properties: { id: { type: 'integer' }, value: { type: 'string' } }, required: ['id', 'value'] },
  },
  {
    name: 'browser_scroll',
    description: 'Açık sayfayı aşağı ya da yukarı kaydırır ve yeni ekran görüntüsü verir.',
    schema: { type: 'object', properties: { direction: { type: 'string', enum: ['down', 'up'] } }, required: ['direction'] },
  },
  {
    name: 'browser_back',
    description: 'Tarayıcıda bir önceki sayfaya döner.',
    schema: { type: 'object', properties: {} },
  },
];

export const isBrowserTool = (name) => Object.hasOwn(impl, name);

// Dönüş: { text, image|null }
export async function runBrowserTool(session, name, input) {
  try {
    return await impl[name](session, input || {});
  } catch (e) {
    return { text: `Hata: ${e.message}`, image: null };
  }
}
