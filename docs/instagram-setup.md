# Instagram: komment → Direct'ga avtomatik narx — sozlash yo'riqnomasi

Bu yo'riqnoma Meta'ning **"Instagram API with Instagram Login"** (Business Login for Instagram) hujjatiga asoslangan,
Graph API **v25.0**. Facebook sahifa kerak emas — Instagram professional akkauntning o'zi yetarli.

Natija: Reels/postga mahsulot biriktirasiz → kimdir "narx", "qancha", "цена", "+" deb yozsa → unga Direct'da shu
mahsulot narxi (Prays'dan, CBU kursida, so'mda) va sayt havolasi boradi, kommentga "Narxini Direct'ga yubordik ✅"
deb javob yoziladi, BKLead'da lid paydo bo'ladi.

---

## 0. Oldindan kerak bo'ladiganlar

1. **Instagram professional akkaunt** (Business yoki Creator). Instagram ilovasida: Profil → ☰ → *Akkaunt turi va vositalar* → *Professional akkauntga o'tish*.
2. Instagram ilovasida **xabarlarga ruxsat**: Sozlamalar → *Xabarlar va hikoyaga javoblar* → *Xabar boshqaruvi* → *Ulangan vositalar* → **"Xabarlarga kirishga ruxsat berish"** — YOQING. Busiz Private Reply ishlamaydi.
3. **Meta Developer akkaunt**: https://developers.facebook.com → *Get Started* (shaxsiy Facebook profilingiz bilan).
4. Vercel'da **PASSWORD_VIEW_KEY** o'rnatilgan bo'lishi kerak (token shu kalit bilan shifrlanadi). Yo'q bo'lsa: `openssl rand -base64 32` → Vercel → Settings → Environment Variables.

---

## 1. Meta'da app yaratish

1. https://developers.facebook.com/apps → **Create App**.
2. *Use case*: **"Manage messaging & content on Instagram"** ni tanlang (Instagram API).
3. App nomi: masalan `BUYUK KARAVAN Instagram`, kontakt email — o'zingizniki.
4. *Business portfolio* so'rasa — kompaniyangiz portfoliosini tanlang (yo'q bo'lsa keyin ulash mumkin; App Review uchun **Business verification** kerak bo'ladi).
5. Yaratilgach: chap menyu → **Instagram** → **API setup with Instagram login**.

## 2. App ID va Secret → Vercel

*API setup with Instagram login* sahifasining tepasida:

- **Instagram app ID** → Vercel'da `INSTAGRAM_APP_ID`
- **Instagram app secret** (*Show*) → Vercel'da `INSTAGRAM_APP_SECRET`

Diqqat: bu *Instagram* app ID/secret — *App settings → Basic* dagi Facebook App ID emas.

Uchinchi o'zgaruvchi — o'zingiz o'ylab topadigan tasodifiy satr:

- `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` — masalan `openssl rand -hex 24` natijasi.

Uchalasini Vercel → Project → Settings → Environment Variables'ga (Production) qo'shing va **qayta deploy** qiling.
Bu qiymatlarni hech kimga yubormang, kodga yozmang.

## 3. Webhook (komment va xabarlar)

*API setup with Instagram login* → **2. Configure webhooks**:

| Maydon | Qiymat |
|---|---|
| Callback URL | `https://buyukkaravan.com/api/instagram/webhook` |
| Verify token | Vercel'dagi `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` bilan **aynan bir xil** |

**Verify and save** → yashil belgi chiqsa, sayt tekshiruvdan o'tdi.
Keyin ro'yxatdan quyidagi maydonlarga **Subscribe** qiling:

- `comments`
- `messages`

(Saytdan "Instagram'ni ulash" bosilganda akkaunt ham avtomatik obuna qilinadi — `POST /me/subscribed_apps`.)

## 4. Redirect URL (Instagram Login)

*API setup with Instagram login* → **3. Set up Instagram business login** → *Business login settings*:

- **OAuth redirect URIs**: `https://buyukkaravan.com/api/instagram/oauth/callback`
- Saqlang.

URL harfma-harf mos bo'lishi shart (https, oxirida `/` yo'q).

## 5. Kerakli ruxsatlar (permissions)

| Ruxsat | Nima uchun |
|---|---|
| `instagram_business_basic` | Akkaunt nomi, postlar/Reels ro'yxati |
| `instagram_business_manage_comments` | Komment webhooklari, kommentga ochiq javob, Private Reply |
| `instagram_business_manage_messages` | Direct'ga xabar (Private Reply) va kelgan xabarlar webhooki |

## 6. Saytda ulash

1. Admin panel → **Sozlamalar** → **Instagram** kartasi (faqat Super Admin ko'radi).
2. **Instagram'ni ulash** → Instagram'ga kiring → ruxsatlarni tasdiqlang.
3. Qaytgach kartada: `@akkaunt`, token muddati (60 kun), webhook holati ko'rinadi.
   Token har kuni tekshiriladi va 20 kun qolganda avtomatik yangilanadi (Vercel Cron, `/api/cron/instagram`).
4. Admin panel → **Instagram** bo'limi → postni **Sozlash** → mahsulot tanlang → **Saqlash**.

## 7. Development rejimida sinash (App Review'gacha)

App hali *Development* rejimida bo'lsa, faqat app'dagi rollarga ega odamlar bilan ishlaydi:

1. App Dashboard → **App roles** → **Roles** → *Add People* → **Instagram Tester** — sinovchining Instagram nomini kiriting.
2. Sinovchi: instagram.com → Sozlamalar → *Apps and websites* → *Tester invites* → **Accept**.
3. Sinovchi akkauntdan postingizga "narxi qancha?" deb yozing → Direct'ga narx kelishi, admin paneldagi jurnalda "Yuborildi" chiqishi kerak.

Muhim (Meta hujjati): `comments` webhooklari faqat app **Live** rejimda va ruxsatlar **Advanced Access** bo'lganda keladi.
Ya'ni haqiqiy mijozlar uchun App Review majburiy.

## 8. App Review — nima yozish kerak

App Dashboard → **App Review** → **Permissions and features** → har bir ruxsat yonida **Request advanced access**.
Avval: *App settings → Basic* da **Privacy Policy URL** (`https://buyukkaravan.com/...` maxfiylik sahifasi), **App icon**, **Category** (Business and Pages) to'ldirilgan bo'lsin, **Business verification** tugagan bo'lsin.

Har bir ruxsat uchun "How will your app use this permission?" maydoniga (inglizcha yozing) — namunalar:

**instagram_business_basic**
> BUYUK KARAVAN (buyukkaravan.com) is a refrigeration equipment company. Our own admin panel uses this permission to show our Instagram professional account's username and the list of our latest posts and Reels, so that our staff can link each post to a product from our catalogue. Only our own account is connected; no data of other users is displayed or stored except what is needed for the reply log.

**instagram_business_manage_comments**
> When a person comments on one of our posts asking for the price (e.g. "narxi qancha?", "цена?"), we receive the comment via the `comments` webhook, check it against keywords set by our staff, and post one short public reply under the comment ("We sent the price to your Direct"). We reply to each comment at most once, only within 7 days, and never to our own comments.

**instagram_business_manage_messages**
> For a price question in a comment we send exactly one Private Reply (POST /{ig-user-id}/messages with recipient.comment_id) containing the product name, its current price and a link to the product page on buyukkaravan.com. Replies the person sends back in Direct are received via the `messages` webhook and shown to our sales staff, who answer manually in the Instagram app. We do not send promotional or unsolicited messages.

"Testing instructions" maydoniga:
> 1. Log in at https://buyukkaravan.com/admin/login with the test credentials below. 2. Open Sozlamalar (Settings) → Instagram and click "Instagram'ni ulash" to connect via Instagram Login. 3. Open the "Instagram" section, click "Sozlash" on a post, choose a product and save. 4. From a tester Instagram account, comment "narxi qancha?" on that post. 5. The tester receives a Direct message with the price; the comment gets a public reply; the "Jurnal" table shows the status "Yuborildi".

Meta'ga test uchun alohida admin login bering (masalan vaqtinchalik ADMIN foydalanuvchi) va Review tugagach o'chiring.

## 9. Screencast (video) — nimani yozib berish kerak

Har bir ruxsat uchun bitta video yetadi (bitta umumiy video ham bo'ladi), 1–3 daqiqa, ovozsiz bo'lsa ham mayli, **ingliz tilidagi izohlar** (subtitle yoki ekranga yozuv) bilan:

1. **Login**: brauzerda buyukkaravan.com/admin → Sozlamalar → Instagram → "Instagram'ni ulash" → Instagram login oynasi → ruxsatlar ro'yxati ko'rinadigan ekran → *Allow* → saytga qaytish, `@akkaunt` va token muddati ko'rinadi. (`instagram_business_basic`)
2. **Postlar ro'yxati**: "Instagram" bo'limida postlar va Reels rasmlari bilan ko'rinadi; bittasiga mahsulot tanlab saqlash. (`instagram_business_basic`)
3. **Komment → javob**: telefonda tester akkauntdan postga "narxi qancha?" yozish → bir necha soniyadan keyin kommentga ochiq javob paydo bo'lishi. (`instagram_business_manage_comments`)
4. **Direct**: tester akkauntning Direct'ida narx, havola va telefon bilan xabar kelgani; admin paneldagi jurnalda "Yuborildi" va lid. Tester Direct'ga javob yozsa — "Direct'dan kelgan javoblar" ro'yxatida chiqishi. (`instagram_business_manage_messages`)

Maslahatlar: ekranni to'liq yozing (URL satri ko'rinsin), tezlashtirmang, parol yozilgan joylarni xiralashtiring.
Rad etilsa — Meta yozgan sababni o'qing, videoni o'sha qadam bilan to'ldirib qayta yuboring.

## 10. Review'dan keyin

1. App Dashboard tepasida **App Mode: Live** ga o'tkazing.
2. Sozlamalar → Instagram → **Webhookni qayta ulash** (yoki "Qayta ulash").
3. Haqiqiy akkauntdan sinab ko'ring.

## 11. Komment turlari va avto-javoblar

Har komment avval **kalit so'zlar** bilan turlanadi, noaniq bo'lsa **Madina AI** (OpenAI, `OPENAI_API_KEY`; model
`OPENAI_INSTAGRAM_MODEL`, standart `gpt-4.1-mini`). AI ishlamasa — kalit so'z natijasi, u ham bo'lmasa javob berilmaydi.

| Tur | Nima bo'ladi |
|---|---|
| Narx (PRICE) | Direct'ga post matni (erkin; `{narx_som}` `{mahsulot}` `{havola}` `{telefon}` ixtiyoriy) + ochiq javob (variantlardan tasodifiy) + lid |
| Ijobiy (POSITIVE) | AI yozgan 1 jumlalik rahmat (3–12 so'z, kommentning tilida, narx/va'da/chegirmasiz, oxirgi 20 javobga o'xshamasin) |
| Savol (QUESTION) | Ochiq javob "Batafsil ma'lumotni Direct'ga yubordik 📩" + Direct + lid |
| Salbiy (NEGATIVE) | Javob YO'Q; Telegram'da Super Admin'ga xabar [Instagram'da ochish] [Ko'rib chiqildi] |
| Spam | Javobsiz, faqat jurnal |

Admin panel → Instagram → "Avto-javob sozlamalari"da har tur alohida yoqiladi (Ijobiy va Savol standart o'chiq),
kunlik ochiq javob limiti (standart 150) o'rnatiladi. Qoidalar: bitta odamga bitta postda 1 javob; o'z kommentlarimiz
va javob-kommentlarga (reply) javob yo'q; javoblar orasida tasodifiy 20–90 soniya.

Salbiy xabar kelishi uchun Super Admin Telegram'ni ulagan bo'lishi kerak (Sozlamalar → "Seh Telegram boti" → ulash).
Like qo'yish API'da yo'q.

## 12. Direct → Telegram

Madina Direct'da javob bermaydi. Mijoz yozsa (shu jumladan "So'rovlar" papkasi) — Telegram'da kartochka keladi:
`📩 Instagram: @username (Ism) — "xabar" — 14:32` + [Instagram'da ochish ↗] [🚫 Kerak emas].

- Kim oladi: Foydalanuvchilar → xodim qatorida **"Instagram so'rovlarini oladi"** + **Telegram bog'lash** (bir martalik havola, botda START).
- Holatlar: Qaralmagan → Ochildi ("Instagram'da ochish" bosilganda; birinchi bosgan — mas'ul) → Javob berildi (faqat Instagram'dan javob yozilganda). "Kerak emas" — sababi bilan.
- Bir odamning keyingi xabarlari shu kartochkani yangilaydi (oxirgi 3 ta + jami).
- Eslatma: 30 daqiqa javobsiz → ⏰; 2 soat → Super Admin'ga ham. Faqat ish vaqti hisoblanadi (Instagram → Direct, standart 09:00–20:00).
- Ish vaqtidan tashqari kelganlar ertalab bitta ro'yxat bo'lib keladi; 20:00 da kunlik hisobot.
- Telefon raqam yozilsa — BKLead'da lid (manba "Instagram DM"), bir odamga bitta.

**Vercel Hobby** cron'i kuniga 1 marta (±59 daqiqa) ishlaydi: ertalabki ro'yxat va hisobot shu bilan keladi, eslatmalar esa
Instagram/Telegram'dan har hodisa kelganda tekshiriladi. Eslatmalar aniq vaqtda kelishi uchun tashqi cron
(masalan cron-job.org) har 5 daqiqada `GET https://buyukkaravan.com/api/cron/instagram-direct` ni
`Authorization: Bearer <CRON_SECRET>` sarlavhasi bilan chaqirsin (Pro tarifda `*/5 * * * *` qo'yish mumkin).

## Nosozliklar

| Belgi | Sabab / yechim |
|---|---|
| "Verify and save" xato beradi | Vercel'dagi `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` va Meta formasidagi satr bir xil emas, yoki env qo'shilgandan keyin deploy qilinmagan |
| Ulashda "redirect_uri" xatosi | 4-qadamdagi URL aynan `https://buyukkaravan.com/api/instagram/oauth/callback` emas |
| Jurnal bo'sh, kommentlar kelmayapti | App Development rejimida (faqat testerlar) yoki `comments` uchun Advanced Access yo'q; webhook maydoniga obuna yo'q |
| Jurnalda "Xato #10" / "#200" | Ruxsat yo'q yoki Instagram'da "Ulangan vositalar → xabarlarga ruxsat" o'chiq |
| "Xato #551" | Foydalanuvchiga xabar yuborib bo'lmaydi (u cheklagan) — normal holat |
| "Prays'da sotuv narxi yo'q" | Mahsulotga Prays'da narx kiriting; komment 7 kun ichida bo'lsa qayta yozilishi kerak |
| "Navbatda" uzoq turibdi | Meta rate limit — avtomatik qayta urinadi (keyingi webhook, kunlik cron yoki "Navbatni hozir yuborish") |
| Token muddati qizil | "Tokenni yangilash" yoki "Qayta ulash" |

Cheklovlar (Meta qoidasi): bitta kommentga bitta Private Reply; 7 kundan eski kommentga yuborilmaydi; odam javob
yozsa, keyingi xabarlarni 24 soat ichida faqat qo'lda (Instagram ilovasida) yozasiz.
