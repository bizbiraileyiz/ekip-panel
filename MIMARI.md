# Ekip Paneli – Mimari ve Durum

> Bu dosya yeni bir geliştirici oturumunun (Claude) panelin nasıl çalıştığını hızla anlaması için güncel tutulur.
> Son güncelleme: 16 Kasım 2026.

## Amaç ve roller
Murat'ın yapay zekâ ekibi için ortak çalışma ekranı.
- **Murat:** Proje sahibi, onay ve son karar onda.
- **Dev:** Murat'ın Claude uygulamasındaki Claude. Paneli geliştirir. Paneli Claude uygulamasının dahili tarayıcısından okur ve `[Dev]:` ile yazar.
- **Codex:** Murat'ın masaüstündeki ChatGPT. Denetçi ve test sorumlusu, `[Codex]:` ile yazar.
- **Paneldeki Claude / ChatGPT:** API ile çalışan modeller. Otomatik cevap açık odalarda cevap verirler.

**Temel kural:** Konuşmak serbest, uygulamak (kod değişikliği, yayın, silme, harcama) Murat'ın açık onayına bağlı. Çalışma düzeni Ana Oda'nın sabit mesajında yazılı.

## Yığın ve kurulum
- Next.js 16 (App Router) + React 19, tek uygulama (UI + API route'ları).
- PostgreSQL (`pg`). Şema ilk istekte `lib/db.js` içinde otomatik oluşur ya da güncellenir (`CREATE/ALTER … IF NOT EXISTS`).
- Railway: **Dockerfile** ile kurulur (`mcr.microsoft.com/playwright:v1.65.1-noble`, Chromium dahil). `main` dalına push → otomatik yayın (5–8 dk).
- Repo: github.com/bizbiraileyiz/ekip-panel · Canlı: https://ekip-panel-production.up.railway.app/

## Dosyalar
| Dosya | Görev |
|---|---|
| `lib/db.js` | Bağlantı havuzu, şema, yardımcılar (mesaj, ek, ayar, kullanım) |
| `lib/auth.js` | Şifre girişi, sunucu tarafı oturum, deneme sınırı, `withAuth` |
| `proxy.js` | Çerez yoksa /login'e yönlendirir (asıl doğrulama route'larda) |
| `lib/orchestrator.js` | Tur yönetimi: gönderen etiketi, hedef model, otomatik cevap, ek turlar |
| `lib/ai.js` | Sistem istemi, geçmiş → model formatı, Claude/OpenAI çağrıları ve araç döngüleri |
| `lib/github.js` | GitHub salt okunur araçları |
| `lib/browser.js` | Sunucu tarayıcısı (Playwright/Chromium) araçları |
| `app/page.js` | Tüm arayüz (tek sayfa) |

## Veri modeli
- `projects(id, name, memory, memory_version, auto_reply)`: oda. **`memory` = odanın sabit mesajı** (📌), sürüm kontrollü.
- `memory_versions`: sabit mesajın eski halleri.
- `messages(id, project_id, sender, content, archived)`: `sender` değerleri: murat, claude, chatgpt, codex, dev, sistem.
- `attachments(message_id, name, mime, size, data bytea)`: png/jpeg/gif/webp/pdf, ≤4 MB, mesaj başına ≤4.
- `settings(key, value)`: `murat_profile` (Hakkımda).
- `sessions`, `login_failures`, `usage(day, provider, calls, tokens)`.

## Mesaj akışı (`POST /api/projects/:id/send`, NDJSON akışı)
1. `[Codex]:` ya da `[Dev]:` önekiyle başlayan mesajlar o gönderen adıyla kaydedilir, önek silinir. Diğer mesajlar `murat` olarak kaydedilir.
2. Odada `auto_reply = false` ise iş burada biter, model çağrılmaz. Ana Oda bu şekilde çalışır.
3. Hedef belirleme: `@claude` → sadece Claude, `@gpt` ya da `@chatgpt` → sadece ChatGPT, etiket yoksa sırayla Claude → ChatGPT.
4. Bir model diğerini etiketlerse en fazla `MAX_AI_TURNS` (2) ek tur yapılır. Bir model hata verirse tur durur.
5. Olaylar: `typing`, `message`, `ping` (15 sn), `done`, `error`.

## Model çağrıları (`lib/ai.js`)
- **Claude:** Messages API. Sunucu araçları: web_search, web_fetch, code_execution (sürümler ve beta başlığı env ile değiştirilebilir). Yerel araçlar `tool_use` döngüsünde çalışır.
- **ChatGPT:** Responses API. Araçlar: web_search, code_interpreter ve yerel fonksiyonlar (`strict:false`); döngü `previous_response_id` ile, ekran görüntüleri ardından kullanıcı mesajı olarak gider.
- Sunucu araçları 400 hatası verirse çağrı araçsız tekrarlanır ve cevaba not düşülür.
- Bağlam: sistem istemi (roller, kurallar, araçlar, `<murat_hakkinda>` veri bloğu, oda adı) + son 40 mesaj + son 10 ekli mesajın dosyaları.
- Sınırlar: günlük sınır yok (`DAILY_CALL_LIMIT=0`), çıktı 16k token, 25 araç turu, 5 dk zaman aşımı. Maliyet freni olarak API panellerindeki ön ödemeli kredi kullanılıyor.

## Araçlar
- **GitHub (salt okunur):** `github_list`, `github_read`, `github_commits`, `github_commit`. Token yoksa açık repolarda raw, .patch ve .atom adresleri kullanılır.
- **Tarayıcı:** `browser_open` (mobile 390 / tablet 768 / desktop 1280 / wide 1920), `browser_screenshot` (full_page: en fazla 6 kare), `browser_scroll`, `browser_back` her sitede açık.
  - `browser_click`, `browser_type`, `browser_select` sadece test sitelerinde açık: varsayılan `claudeusercontent.com` + `TEST_SITES`.
  - Gömülü çerçeveler (iframe) okunur.
  - Güvenlik: Özel/iç IP, localhost ve *.internal adresleri engellenir; indirme kapalı.
  - **Bilinen sınır:** claude.ai Cloudflare koruması yüzünden sunucu tarayıcısı claude.ai artifact'lerini açamıyor. Artifact testini Codex kendi masaüstünde yapıyor.

## Arayüz
Oda seçimi, + (oda ekle), − (oda sil), Hakkımda, **Otomatik cevap: açık/kapalı**, 📌 (sabit mesaj ekle), Temizle (mesajları kalıcı siler; sabit mesaj ve Hakkımda kalır), Test (API bağlantısı + günlük kullanım), çıkış. Sabit mesaj kutusu varsayılan kapalıdır, açık/kapalı durumu tarayıcıda hatırlanır. Mesajlar markdown olarak gösterilir. 📎, Ctrl+V ya da sürükle-bırak ile ek eklenir.

## Ortam değişkenleri
`DATABASE_URL`, `APP_PASSWORD`, `AUTH_SECRET`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` zorunlu. Diğerleri isteğe bağlı: `CLAUDE_MODEL`, `OPENAI_MODEL`, `MAX_AI_TURNS`, `DAILY_CALL_LIMIT`, `AI_TIMEOUT_MS`, `MAX_OUTPUT_TOKENS`, `MAX_TOOL_ROUNDS`, `ATTACH_WINDOW`, `TOOLS_WEB`, `TOOLS_CODE`, `TOOLS_GITHUB`, `TOOLS_BROWSER`, `TEST_SITES`, `GITHUB_DEFAULT_REPO`, `GITHUB_TOKEN`, `CHROMIUM_PATH` (yerel test için). Ayrıntı `.env.example` dosyasında.

## Geliştirme ve test
- Yerelde: `npm ci && npx next build`, sonra Postgres ve `MOCK_AI=true` ile `npx next start`. Mock modda model çağrısı yapılmaz, sahte cevap döner.
- Değişiklikler `main` dalına push edilince yayına girer. Push öncesi Murat'ın onayı alınır.

## Sürüm geçmişi (özet)
v0.1 temel panel → v0.2 güvenlik (Next 16, oturum, deneme sınırı) → v0.3 araçlar (web/kod/GitHub, ekler, markdown, Hakkımda) → sınırlar kaldırıldı → Temizle (kalıcı silme), oda silme, liste kaldırıldı → v0.4 sunucu tarayıcısı (iframe, 4 boyut, tam sayfa) → @etiketle tek model → otomatik cevap aç/kapa, [Codex]/[Dev] → sabit mesaj (📌).
