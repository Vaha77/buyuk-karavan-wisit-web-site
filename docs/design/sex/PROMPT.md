# VAZIFA: Prays bo'limi + Zborka/Sex zakazlari + Krim nazorati + Komplekt konfiguratori

Dizaynlar: `docs/design/sex/*.dc.html` (har biri bitta interaktiv sahifa — brauzerda ochib ko'r, ko'rinish va ketma-ketlikni aynan shunday qil).
- `prays.dc.html` — Prays bo'limi
- `zborka.dc.html` — Zborka buyurtmasi + "Sex zakazlari" jadvali (rollar bilan)
- `sexdan-olish.dc.html` — zapchast zayavkasi (Magazinga / Mijozga)
- `konfigurator.dc.html` — Komplekt konfiguratori (prays narxida + ustama)
- `bitzer-r22-15.07.26.xlsx` — Bitzer prays (Excel import formati namunasi)

Uslub: mavjud admin (bklead.css), oq kartalar, 16px radius, Manrope/sayt shrifti, mobil 375px da ham ishlasin. Hamma matn o'zbekcha.

---

## 0. UMUMIY QOIDALAR
- Migratsiyalar FAQAT qo'shuvchi. DROP/reset/mavjud ma'lumotni o'chirish TAQIQLANADI.
- Har bir server action va route'da rol tekshiruvi (faqat UI'da yashirish yetmaydi).
- Har bir holat o'zgarishi Faoliyat tarixiga yoziladi (kim, qachon, oldin/keyin).
- Zakaz/zayavka berilgan paytdagi narxlar zakaz ichida MUHRLANADI (snapshot) — keyin prays o'zgarsa eski zakazlar o'zgarmaydi.
- lint + typecheck + build + testlar o'tsin. Bosqichma-bosqich commit qil. Oxirida push va production'ga `prisma migrate deploy`. Qisqa hisobot.

## 1. PRAYS BO'LIMI (/admin/prays) — faqat SUPER_ADMIN
Ma'lumot:
- Product ga `basePriceUsd` (prays/tannarx, nullable) va `priceListDate` (nullable) qo'sh.
- Backfill: mavjud mahsulotlarda `basePriceUsd` = eng kichik butun x, bunda ceil(x × 1,10) = joriy `priceUsd` (hozirgi narxlar shu qoida bilan qo'yilgan). Test bilan tekshir: BR +20PG 968→880, BITZER 2FES+3 1007→915, BRILIANT YBF4FC+5G 528→480.
- `SiteSettings.priceMarkupPercent` (default 10, 1–20).
- `SexPart` jadvali (sex zapchastlari): name, size (F22, 3/8, 20 L…), group (Glazok, Klapan, Shlang, Filtr, Resiver, Kompressor, Kondensator…), basePriceUsd, unit, active. Boshlang'ich ma'lumot YO'Q — admin o'zi kiritadi/Excel bilan yuklaydi.
- `PriceChange` tarixi: entity, oldBase, newBase, source (MANUAL | EXCEL | AI_IMAGE | PERCENT), priceListName, userId, createdAt.

Sahifa (dizayndagi ko'rinish):
- 4 karta: Tayyor mahsulotlar soni (brend bo'yicha), Sex zapchastlari soni, **Sotuv ustamasi select (+1% … +20%)**, "Eng eski prays" (eng uzoq yangilanmagan priceListDate, 60+ kun bo'lsa sariq).
- Ikki tab: "Tayyor mahsulotlar" / "Sex zapchastlari"; brend/guruh chip filtrlari; qidiruv.
- Jadval: Nomi · Brend/tur · Prays narxi · Sotuv (+X%) · O'zgargan · Amal.
- Har qatorda **"O'zgartirish"** (prays narxi inline input → Saqlash/×) va **O'chirish** (savat ikonka → qator qizaradi → "Ha, o'chirish" tasdig'i). O'chirish = mahsulotni yashirish (soft: isVisible=false + archived), haqiqiy DELETE emas.
- Ustama o'zgarsa: preview ("412 ta sotuv narxi o'zgaradi, masalan … $968 → $1 012") → Tasdiqlash → hamma `priceUsd` = ceil(basePriceUsd × (100+X)/100). basePriceUsd bo'sh mahsulotlarga tegilmaydi.
- Tugmalar: **Excel yuklab olish** (joriy prays), **Excel yuklash**, **Rasm orqali (AI)** (mavjud lib/ai-office/price-list-parser.ts dan foydalan), **Foiz bilan o'zgartirish** (filtr + ±%).
- Import/foiz oqimi har doim: tahlil → preview jadvali (Eski · Yangi · Farq% · Holat: O'zgaradi / Arzonlashadi / Yangi / O'zgarmaydi) → **Tasdiqlash** → PriceChange yoziladi.
- Excel import: `bitzer-r22-15.07.26.xlsx` formatini tanisin (1-qator sarlavha+sana, 2-qator ustunlar: Kompressor, R/B, R/B ustida, Vodinoy kondensator, Vodinoy Agregat, Vozdushniy kondensator, Vozdushniy Agregat, …). Model nomi bo'yicha mavjud mahsulotlarga moslasin (BITZER {model} kompressor / resiver ustida {L}L / vadinoy agregat · vadinoy kondensator {HP} / vazdushniy agregat · {FN}). Mos kelmaganlarini "Topilmadi" deb ko'rsatsin, avtomatik yaratmasin.
- O'ngda "Narx tarixi" paneli (PriceChange oxirgi 20 ta).
- Sotuvchi faqat sotuv narxini ko'radi; SEX roli narxni umuman ko'rmaydi.

## 2. ROLLAR
- Yangi rol: `WORKSHOP` (Sex mas'uli, masalan Ikromjon). Foydalanuvchilar sahifasida tanlanadi.
- WORKSHOP faqat `/admin/sex` (o'z vazifalari) ni ko'radi, boshqa hamma joy redirect (SELLER kabi).
- SELLER: zakaz/zayavka yaratadi, o'zinikini ko'radi.
- SUPER_ADMIN: hammasini ko'radi, faqat "Krimga oldim" tugmasi uniki (WORKSHOP tugmalarini bosa olmaydi).

## 3. SEX ZAKAZLARI (bitta model, ikki turi)
`WorkshopOrder`: number (ketma-ket #0001), type (AGREGAT | ZAPCHAST), purpose (SHOP = "Magazinga (vitrina)" | CLIENT = "Mijozga"), customerName (CLIENT da majburiy; doimiy mijozdan tanlash yoki matn), qty, dueDate, note, sellerId, status (NEW | ACCEPTED | ISSUED | RECEIVED), acceptedById/At, issuedById/At, receivedById/At, priceSnapshot JSON, telegramMessageId.
`WorkshopOrderItem`: kind (PRODUCT | PART), productId/partId, title, options JSON (resiver L, vadinoy HP, FN), qty, baseUsd snapshot, changedFromStandard.

### 3a. Zborka buyurtmasi (/admin/sex/new?type=agregat) — dizayn: zborka.dc.html
- 1-qadam: Prays select (Bitzer R22 / XUEYING / Briliant R22 / Briliant R404) → Kompressor select.
- 2-qadam: 4 tugma — Kompressor o'zi · Resiver bachok ustida · Vadinoy agregat · Vazdushniy agregat.
  - Kompressor o'zi: faqat nom + buyurtma.
  - Resiver ustida: Resiver select (8/10/12/15/20/30/38/45 L), standart belgilangan.
  - Vadinoy: Resiver + Vadinoy kondensator HP select.
  - Vazdushniy: Resiver + FN kondensator select (rama bilan).
  - Standartdan farq qilsa sariq "standart X · +$Y" belgisi; narx avtomatik.
- Narx (prays narxida): standart mahsulot narxi + Σ(tanlangan qism − standart qism). Qism narxlari prays jadvalidan:
  - vadinoy kondensator = vadinoy agregat − R/B ustida (Bitzer'da barcha modellarda bir xil chiqadi: 3HP 178, 5HP 245, 8HP 290, 10HP 321, 15HP 431, 20HP 539, 30HP 763, 40HP 942, 50HP 1125);
  - FN bloki = vazdushniy agregat − R/B ustida (FN22 250, FN43 403, FN70 626, FN80 689, FN105 833, FN120 1016, FN160 1228, FN180 1381, FNV200 1646, FNV240 1900, FNV280 2254, FNV300 2411, FNV350 2675);
  - resiver: SexPart "Resiver bachok {L}" narxidan (admin kiritadi). Narxi kiritilmagan bo'lsa resiver almashtirish o'chiq turadi va "Resiver narxi kiritilmagan" yoziladi.
  - Bu jadvallarni kodga yozma — Prays bazasidan hisobla, testda yuqoridagi qiymatlar chiqsin.
- 3-qadam: Soni, Tayyor bo'lishi kerak (sana), Kimga (Magazinga / Mijozga + mijoz), Izoh.
- O'ngda buyurtma kartasi + "Buyurtma berish".

### 3b. Zapchast zayavkasi (/admin/sex/new?type=zapchast) — dizayn: sexdan-olish.dc.html
- Qatorlar: SexPart select + soni (+ Mahsulot qo'shish); Kimga (Magazinga / Mijozga + mijoz).

### 3c. Telegram
- Mavjud lib/telegram bot orqali yangi guruhga (env: TELEGRAM_WORKSHOP_CHAT_ID) xabar: "🔧 Yangi zakaz #0413 — Abduraxmon", tarkib (standartdan o'zgarganlari "(standart FN160 o'rniga)"), soni, muddat, kimga. NARX YO'Q.
- Inline tugmalar "Qabul qildim" / "Chiqib ketdi" — bosilsa saytdagi holat yangilanadi (faqat WORKSHOP foydalanuvchining telegramChatId bilan moslashgan odam bosa oladi), xabar holat bilan tahrirlanadi.

### 3d. Sex zakazlari jadvali (/admin/sex) — dizayn: zborka.dc.html pastki qismi
- Ustunlar: № · Sana · Turi (Agregat/Zapchast) · Mahsulot · Zayavka beruvchi (ism + vaqt) · Kimga (Vitrina / Mijoz: …) · **Jarayon** (3 qator: Qabul qildi: ism·vaqt / Chiqarib yubordi: ism·vaqt / Krimga oldi: ism·vaqt; yashil=bajarilgan, qizil=hozir kutilmoqda, kulrang=navbati kelmagan) · Holat · Amal.
- Holatlar: Yangi → Qabul qilindi → Chiqib ketdi → Krimga olindi.
- WORKSHOP ko'rinishi "Mening vazifalarim": faqat NEW va ACCEPTED; tugmalar "Qabul qildim", "Chiqib ketdi" (berilgan sonni tuzatish mumkin).
- WORKSHOP uchun "+ Zayavkasiz chiqim": shoshilinch berilgan tovarni o'zi yozadi (sotuvchini tanlaydi) → ISSUED holatida, "Zayavkasiz" belgisi bilan; sotuvchiga tasdiq uchun ko'rinadi.
- SUPER_ADMIN ko'rinishi: hammasi; 4 hisoblagich (Yangi · Sexda ishlanmoqda · Chiqib ketdi·krim kutmoqda (qizil) · Krimga olindi); oy select; **Excel yuklab olish**; tugma faqat ISSUED qatorlarda "Krimga oldim".
- 24 soatdan ortiq "Chiqib ketdi" holatida turganlar qizil ajralsin; sidebar'da son badge.
- SELLER: "Mening zakazlarim" — o'z zakazlari va holati.

## 4. KOMPLEKT KONFIGURATORI (Hisob-kitob ichida) — dizayn: konfigurator.dc.html
- Standart shablon (masalan XUEYING BR +20PG komplekt FN160 + DD160, prays $4 454) → Kompressor / Kondensator bloki (rama+resiver bilan) / Isparitel qismi almashtiriladi.
- Qism narxlari prays farqlaridan: kondensator bloki = shu kondensatorli standart agregat − uning kompressori; isparitel qismi = komplekt − agregat. Har qismda "Manba: …" qatori (qanday hisoblangani).
- Hisob FAQAT prays narxida; oxirida ustama select 0–15% (polzunok + 0/5/10/15 tugmalari), mijoz narxi butun dollarga yuqoriga yaxlitlanadi; Qo'shimchalar qatorlari (nom + narx, sotuvchi qo'shadi).
- Saqlash mijoz/lidga bog'lanadi; "Tijorat taklifi PDF" mavjud hisob-kitob PDF'idan foydalanadi; tannarx/marja faqat SUPER_ADMIN ga.
- Tekshiruv: BR +20PG + FNV200 + DD160 = $4 954 prays, +10% = $5 450.

## 5. TESTLAR
- basePrice backfill teskari hisobi; ustama qayta hisobi (ceil).
- Qism narxlari (vadinoy HP va FN jadvali yuqoridagi qiymatlar).
- Holat mashinasi: faqat ruxsat etilgan o'tishlar, faqat tegishli rol (WORKSHOP krim qila olmaydi, ADMIN qabul qila olmaydi).
- SELLER boshqa sotuvchining zakazini ko'rmaydi; WORKSHOP narxni ko'rmaydi (payload'da ham yo'q).
- Excel import moslashtirish (bitzer xlsx).

Tartib: 1 → 2 → 3 → 4. Har bosqichdan keyin commit. Push oldidan build. Hisobotda: qanday rollar yaratish kerak, TELEGRAM_WORKSHOP_CHAT_ID qayerga qo'yiladi, menda qaysi ma'lumot kerak (sex zapchastlari ro'yxati, resiver narxlari).
