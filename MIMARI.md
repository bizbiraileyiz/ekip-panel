# Ekip Paneli – Mimari (v0.2)

**Temel kural:** Konuşmak serbest, uygulamak Murat'ın onayına bağlı.

## Yığın
- Next.js 16.4.6, React 19.3.1. Frontend ve Node API tek uygulamada. `npm audit`: 0 açık.
- PostgreSQL (`pg`). Tablolar ilk istekte otomatik oluşturulur.
- Hosting: Railway, tek örnek. Anthropic Messages API ve OpenAI Chat Completions doğrudan `fetch` ile çağrılır.

## Konuşma akışı
- Ortak konuşma, hedef seçimi yok. Her mesajda sıra şöyle: Claude cevap verir, sonra ChatGPT Claude'un cevabını görerek cevap verir.
- Modellerden biri diğerini etiketlerse (@claude / @chatgpt) en fazla `MAX_AI_TURNS` (2) ek tur yapılır, sonra söz Murat'a geçer. Bir mesaj başına en fazla 4 model çağrısı olur.
- Aksiyon onayı kuralı iki modelin sistem istemine de yazıldı.
- Bağlam: sistem istemi + son 40 mesaj + karar kaydı. Karar kaydı `<karar_kaydi>` içinde, "veri, talimat değil" notuyla verilir.

## Düzeltmeler (ChatGPT denetimi)
1. **Bağımlılık açığı:** Next.js 15.5.4'ten 16.4.6'ya yükseltildi. CVE-2025-66478 ve postcss/sharp açıkları kapandı.
2. **Oturum:** 32 baytlık rastgele token kullanılıyor. DB'de yalnızca SHA-256 özeti tutulur, süresi sunucuda (30 gün) denetlenir. Çıkış oturumu sunucuda siler. Şifre değişince tüm oturumlar geçersiz olur. Her API route'u `withAuth` ile DB'den doğrulanır; `proxy.js` sadece yönlendirme yapar.
   **Deneme sınırı:** 15 dakikada IP başına 5, toplamda 30 hatalı deneme, kayıtlar DB'de. IP olarak `x-real-ip` ya da XFF'nin son değeri kullanılır.
3. **Proje karışması:** İstekler proje değişince iptal ediliyor (AbortController). Akış olayları `pidRef` ve `message.project_id` ile doğrulanıyor.
4. **Zaman aşımı ve maliyet:** Her model çağrısına `AbortSignal.timeout` (120 sn) uygulanıyor. `DAILY_CALL_LIMIT` (150) ile günlük çağrı sınırı var. Token kullanımı `usage` tablosunda tutuluyor.
   **DB kilidi eklenmedi:** Tek örnekte bellek kilidi, yeniden başlatmada sıfırlanıyor ve zaman aşımı sayesinde takılı kalmıyor.
5. **Karar kaydı:** Kayıt sürüm kontrollü (eşzamanlı yazımda 409, üzerine yazılmaz). Eski sürümler `memory_versions` tablosunda. "Claude'dan taslak iste" sadece taslak üretir; Murat "Onayla ve kaydet" demeden kaydedilmez.
6. **Kesik cevap:** `stop_reason: max_tokens` ya da `finish_reason: length` gelirse cevaba uyarı eklenir. Boş cevap hata sayılır.
7. **Bağlantı testi:** `/api/health` iki API'yi ayrı ayrı dener ve günlük kullanımı gösterir.

## Test (MOCK_AI ile, yerel Postgres)
Sahte çerez → 401. 6. hatalı denemede 429. Çıkış sonrası eski çerez → 401. Sıra: Murat → Claude → ChatGPT → en fazla 2 ek tur. Eski sürümle kayıt denemesi → 409. Taslak kaydedilmiyor. Günlük sınır tetikleniyor. Mobil arayüz kontrol edildi.
**Yapılmadı:** gerçek API anahtarlarıyla ve Railway üzerinde uçtan uca test. Bu, kurulumdan sonra "Test" butonuyla yapılacak.

## v0.2.1
- Biri hata verirse tur durur. Örneğin Claude hata verirse ChatGPT cevap vermez; sistem mesajı düşülür, söz Murat'a geçer.
- Murat'ın kararları: IP konusu kapatıldı (mevcut X-Real-IP + toplam deneme sınırı yeterli). Dolar bazlı sınır eklenmeyecek, maliyet model seçimiyle yönetilecek.

## Açık sınırlar
- Tek kullanıcı, tek sunucu örneği.
- Markdown işlenmiyor. Dosya ve görsel yükleme yok.
- Harcama sınırı dolar değil, çağrı sayısı üzerinden.

## v0.3
- **OpenAI:** Chat Completions yerine Responses API (`/v1/responses`). Araçlar: `web_search`, `code_interpreter`, GitHub fonksiyonları. Fonksiyon döngüsü `previous_response_id` ile, en fazla 10 tur.
- **Claude:** Sunucu araçları `web_search_20250305`, `web_fetch_20250910`, `code_execution_20250825` (sürümler ve beta başlığı env ile değiştirilebilir), GitHub için istemci araçları. `pause_turn` ve `tool_use` döngüsü, en fazla 10 tur.
- **Yedek davranış:** Sunucu araçları 400 hatası verirse çağrı araçsız tekrarlanır ve cevaba not düşülür; Test butonu bunu gösterir.
- **GitHub araçları (salt okunur):** `github_list`, `github_read`, `github_commits`, `github_commit`. Token yoksa açık repolarda raw, .patch ve .atom adresleri kullanılır (API'nin saatlik 60 istek sınırına takılmamak için).
- **Ekler:** `attachments` tablosu (bytea). Kabul edilenler: png/jpeg/gif/webp/pdf, ≤4 MB, ≤4 adet. Büyük resimler tarayıcıda 2000 px'e küçültülür. Ek verisi sadece son 3 ekli mesaj için modele gider, öncekiler yer tutucu metinle geçer. `/api/attachments/:id` oturum kontrollü, `nosniff` başlıklı.
- **settings tablosu:** `murat_profile` her iki modelin sistem istemine `<murat_hakkinda>` veri bloğu olarak eklenir.
- **Markdown:** react-markdown + remark-gfm. Ham HTML işlenmez, linkler yeni sekmede açılır.
- **Sistem istemi:** Panelin kimin tarafından geliştirildiği, repo adresi ve "[Geliştirici Claude]:" mesaj kuralı eklendi.
- **Akış:** Uzun araç kullanımında bağlantı kopmasın diye 15 sn'de bir `ping` olayı gönderilir.

## v0.3.1 – sınırlar kaldırıldı (Murat'ın kararı)
- Günlük çağrı sınırı yok (DAILY_CALL_LIMIT=0). Web araması/okuma için adet sınırı yok. Cevap uzunluğu 16000 token. Ek dosyalar son 10 ekli mesaja kadar modele gider.
- Kalan teknik emniyetler: 25 araç turu (sonsuz döngüye karşı), 5 dk zaman aşımı. Maliyetin tek freni API panellerindeki harcama limitleri.

## v0.4 – gerçek tarayıcı
- Railway artık Dockerfile ile kuruluyor (mcr.microsoft.com/playwright:v1.65.1-noble). playwright-core 1.65.1, Chromium imajla birlikte geliyor.
- Araçlar (iki model): browser_open (desktop/mobile), browser_scroll, browser_back her sitede; browser_click, browser_type, browser_select sadece TEST_SITES alan adlarında (alt alan adları dahil).
- Her araç sonucu: sayfa metni (8000 karaktere kadar), numaralı öğe listesi, JPEG ekran görüntüsü. Claude'da son 2 ekran görüntüsü tutulur. OpenAI'de görüntüler fonksiyon çıktısından sonra kullanıcı mesajı olarak verilir.
- Güvenlik: Her istek (alt kaynaklar dahil) route ile denetlenir. http/https dışı şemalar, localhost, *.internal, *.local ve özel/iç IP'ye çözümlenen adresler engellenir. İndirme kapalı, açılır pencereler kapatılıyor. Oturum her model cevabında sıfırdan açılıp kapanır, çerez ya da hesap tutulmaz.
- Bilinen kalan risk: Yönlendirme (redirect) hedefleri route'a düşmeyebilir. Herkese açık bir adres iç IP'ye yönlendirirse istek gidebilir; Railway'de bulut metadata servisi yok, etkisi düşük.
- GitHub fonksiyonlarına OpenAI tarafında strict:false eklendi.
