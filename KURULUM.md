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
