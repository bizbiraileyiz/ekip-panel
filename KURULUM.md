# Kurulum (Railway) – yaklaşık 15 dakika

1. **GitHub:** github.com'da ücretsiz hesap aç ve yeni bir **private** repo oluştur (örneğin `ekip-panel`). Bu klasördeki dosyaları "Add file → Upload files" ile yükle.
2. **Railway:** railway.com'a GitHub hesabınla gir ve **New Project → Deploy from GitHub repo → ekip-panel** seç.
3. Aynı projede **+ New → Database → PostgreSQL** ekle.
4. Uygulama servisine gir, **Variables** sekmesini aç ve şunları ekle:
   - `DATABASE_URL` → Postgres'in değişkenini referans ver: `${{Postgres.DATABASE_URL}}`
   - `APP_PASSWORD` → panel şifren
   - `AUTH_SECRET` → rastgele uzun bir metin
   - `ANTHROPIC_API_KEY` → Claude anahtarın
   - `OPENAI_API_KEY` → OpenAI anahtarın
   - (isteğe bağlı) `CLAUDE_MODEL`, `OPENAI_MODEL`, `MAX_AI_TURNS`
5. **Settings → Networking → Generate Domain** ile adres al. Bu adresi telefonda ve bilgisayarda aç, şifrenle gir.
6. Üstteki **Test** butonuna bas. İki satırda da "çalışıyor" yazmalı. Hata çıkarsa ekran görüntüsünü bize at.
7. API panellerinde (console.anthropic.com, platform.openai.com) aylık harcama limiti de koy. Bu, ikinci emniyet olur.

Anahtarları sadece Railway'e gir. Sohbete ya da GitHub'a yazma.

## Kullanım
- Üstteki listeden projeyi seç. "+" ile yeni proje ekleyebilirsin.
- Her mesajına önce Claude, sonra ChatGPT cevap verir.
- **Karar kaydı:** projenin ortak hafızası. Elle düzenleyebilirsin. "Claude'dan taslak iste" dersen taslak gelir, sen onaylamadan kaydedilmez. Eski sürümler "Geçmiş" menüsünde durur.

## v0.3 – araçlar
- Modeller internette arayabilir, link okuyabilir (Claude), kod çalıştırabilir ve GitHub'daki kodu okuyabilir.
- Mesaja resim/PDF eklemek için 📎, yapıştırma (Ctrl+V) ya da sürükle-bırak. Dosya başına en fazla 4 MB, mesaj başına 4 dosya.
- **Hakkımda:** tüm projelerde ortak "Murat hakkında" metni.
- İsteğe bağlı `GITHUB_TOKEN`: GitHub → Settings → Developer settings → Fine-grained tokens → sadece `ekip-panel`, izin: Contents = Read-only. Token yoksa dosya okuma ve son değişiklik yine çalışır; tüm dosya listesi saatlik sınıra takılabilir.
- Bir araç sorun çıkarırsa Railway'de `TOOLS_WEB=false` ya da `TOOLS_CODE=false` ile kapatılabilir.

## v0.4 – gerçek tarayıcı
- Railway, kurulumu artık Dockerfile ile yapıyor; ilk kurulum 5–8 dakika sürebilir.
- Railway → Variables altına ekle: `TEST_SITES` = tıklama/yazma testi yapılabilecek siteler, virgülle. Örnek: `somborka.com,garantisogutma.com.tr`
- Diğer bütün sitelerde modeller sadece bakar.
