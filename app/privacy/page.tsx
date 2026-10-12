import type { Metadata } from "next";
import Link from "next/link";
import { COMPANY, LegalPage, langOf, type Lang } from "@/components/legal/legal-page";

const UPDATED = { uz: "Oxirgi yangilanish: 12-oktabr 2026", ru: "Последнее обновление: 12 октября 2026" };

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ lang?: string }> }): Promise<Metadata> {
  const lang = langOf((await searchParams).lang);
  const title = lang === "ru" ? "Политика конфиденциальности — BUYUK KARAVAN" : "Maxfiylik siyosati — BUYUK KARAVAN";
  const description = lang === "ru" ? "Какие данные собирает Buyuk Karavan MChJ (сайт, ассистент Мадина, Instagram), зачем, как хранит и защищает." : "Buyuk Karavan MChJ qanday ma’lumot yig‘adi (sayt, Madina AI, Instagram), nima uchun, qanday saqlaydi va himoya qiladi.";
  return { title, description, alternates: { canonical: lang === "ru" ? "/privacy?lang=ru" : "/privacy", languages: { uz: "/privacy", ru: "/privacy?lang=ru" } } };
}

function Uz() {
  return <div className="legal-card">
    <p>Ushbu siyosat <b>{COMPANY.name}</b> (keyingi o‘rinlarda — “Kompaniya”, “biz”) buyukkaravan.com sayti, sayt ichidagi Madina AI yordamchisi va Instagram akkauntimiz (@buyuk_karavan) orqali olinadigan shaxsiy ma’lumotlarga qanday munosabatda bo‘lishini tushuntiradi.</p>
    <section><h2>1. Qanday ma’lumot yig‘amiz</h2><ul>
      <li><b>Sayt formalari:</b> ismingiz, telefon raqamingiz, Telegram manzilingiz, viloyat/hudud, so‘rov mazmuni (mahsulot, o‘lcham, harorat, sig‘im).</li>
      <li><b>Madina AI chat:</b> chatda yozgan xabarlaringiz va siz bergan aloqa ma’lumotlari.</li>
      <li><b>Instagram:</b> Instagram foydalanuvchi nomingiz (username) va Instagram bergan ichki identifikator, postlarimizga yozgan kommentlaringiz, bizga Direct’da yuborgan xabarlaringiz va ularning vaqti.</li>
      <li><b>Telefon raqami:</b> formada, chatda yoki Direct xabarda o‘zingiz yozgan bo‘lsangiz.</li>
      <li><b>Texnik ma’lumot:</b> sahifaga kirish vaqti, qurilma turi (mobil/kompyuter), taxminiy mamlakat va hudud — sayt va reklama samaradorligini o‘lchash uchun. Instagram akkauntimiz bo‘yicha umumlashtirilgan statistika (qamrov, ko‘rishlar, yosh/jins/shahar ulushlari) — u shaxsni aniqlamaydi.</li>
      <li><b>Meta Pixel va Conversions API:</b> reklama samaradorligini o‘lchash uchun ommaviy sahifalarda Meta (Facebook/Instagram) Pixel ishlaydi — sahifa ko‘rilgani, mahsulot ko‘rilgani va forma yuborilgani haqida hodisa Meta’ga boradi. Forma yuborilganda telefon raqamingiz Meta’ga faqat <b>SHA-256 bilan xeshlangan</b> (ochiq bo‘lmagan) holda yuboriladi. Boshqaruv paneli sahifalarida Pixel ishlamaydi. Meta reklama sozlamalarini Facebook/Instagram’dagi “Reklama afzalliklari” bo‘limida boshqarishingiz mumkin.</li>
    </ul></section>
    <section><h2>2. Nima uchun foydalanamiz</h2><ul>
      <li>So‘ragan mahsulotingiz <b>narxini yuborish</b> (masalan, Instagram’da “narx” deb yozsangiz — Direct’ga narx yuboriladi).</li>
      <li>So‘rovingizni <b>lid</b> sifatida qayd etish va sotuv bo‘limi mutaxassisiga topshirish.</li>
      <li>Savolingizga <b>javob berish</b>, siz bilan bog‘lanish, hisob-kitob va tijorat taklifini tayyorlash.</li>
      <li>Xizmat sifatini nazorat qilish (javob vaqti, javobsiz qolgan murojaatlar) va spam/haqoratli kommentlarni ajratish.</li>
    </ul><p>Ma’lumotlaringiz reklama maqsadida profillashtirilmaydi va avtomatik qaror qabul qilishda ishlatilmaydi.</p></section>
    <section><h2>3. Ma’lumot kimga beriladi</h2>
      <p>Shaxsiy ma’lumotlaringiz <b>uchinchi shaxslarga sotilmaydi va berilmaydi</b>. Ularni faqat Kompaniyaning vakolatli xodimlari (sotuv bo‘limi, administratorlar) ko‘radi. Xizmat ishlashi uchun ma’lumot texnik provayderlarda saqlanadi va qayta ishlanadi: hosting va ma’lumotlar bazasi, Telegram (ichki xodimlarga bildirishnoma), Meta/Instagram (Direct va komment javoblari, reklama hodisalari — Pixel), shuningdek matnni tasniflash uchun AI xizmati — ular ma’lumotdan o‘z maqsadlarida foydalanmaydi. Qonun talab qilgan hollarda vakolatli davlat organlariga berilishi mumkin.</p>
    </section>
    <section><h2>4. Saqlash muddati</h2><ul>
      <li>Instagram kommentlari va Direct xabarlari yozuvlari — <b>12 oygacha</b>, keyin o‘chiriladi yoki anonimlashtiriladi.</li>
      <li>Lid va mijoz ma’lumotlari — hamkorlik davomida va oxirgi murojaatdan keyin <b>3 yilgacha</b> (kafolat, servis va buxgalteriya talablari uchun).</li>
      <li>O‘chirish so‘rovi kelsa — muddatdan qat’i nazar, <b>30 kun ichida</b> o‘chiriladi (<Link href="/data-deletion">ma’lumotni o‘chirish tartibi</Link>).</li>
    </ul></section>
    <section><h2>5. Xavfsizlik</h2>
      <p>Sayt faqat shifrlangan HTTPS orqali ishlaydi. Boshqaruv paneliga faqat parol bilan va rolga qarab kirish mumkin; Instagram kirish kaliti shifrlangan holda saqlanadi; Meta’dan keladigan xabarlar imzo bilan tekshiriladi. Ma’lumotlar zaxira nusxalari ham himoyalangan saqlanadi.</p>
    </section>
    <section><h2>6. Sizning huquqlaringiz</h2>
      <p>Siz o‘zingiz haqidagi ma’lumotni ko‘rish, tuzatish yoki o‘chirishni so‘rashingiz, Instagram orqali ishlov berishga roziligingizni qaytarib olishingiz mumkin (Instagram → Sozlamalar → “Ilovalar va saytlar” → ilovani o‘chirish). Batafsil: <Link href="/data-deletion">ma’lumotni o‘chirish</Link>.</p>
    </section>
    <section><h2>7. Aloqa</h2>
      <p><b>{COMPANY.name}</b><br/>{COMPANY.city.uz}<br/>Telefon / Telegram: <a href={COMPANY.phoneHref}>{COMPANY.phone}</a></p>
      <p className="legal-note">Siyosat o‘zgarsa, yangi tahrir shu sahifada e’lon qilinadi va yuqoridagi sana yangilanadi.</p>
    </section>
  </div>;
}

function Ru() {
  return <div className="legal-card">
    <p>Настоящая политика объясняет, как <b>{COMPANY.name}</b> (далее — «Компания», «мы») обращается с персональными данными, полученными через сайт buyukkaravan.com, ассистента Мадина на сайте и наш Instagram-аккаунт (@buyuk_karavan).</p>
    <section><h2>1. Какие данные мы собираем</h2><ul>
      <li><b>Формы на сайте:</b> имя, номер телефона, Telegram, область/регион, содержание запроса (товар, размеры, температура, объём).</li>
      <li><b>Чат с ассистентом Мадина:</b> ваши сообщения в чате и указанные вами контакты.</li>
      <li><b>Instagram:</b> имя пользователя (username) и внутренний идентификатор Instagram, ваши комментарии под нашими публикациями, сообщения, отправленные нам в Direct, и их время.</li>
      <li><b>Номер телефона:</b> если вы сами указали его в форме, чате или сообщении Direct.</li>
      <li><b>Технические данные:</b> время посещения, тип устройства (мобильный/компьютер), примерные страна и регион — для оценки эффективности сайта и рекламы. Обобщённая статистика нашего Instagram-аккаунта (охват, просмотры, доли по возрасту/полу/городу) — она не позволяет установить личность.</li>
      <li><b>Meta Pixel и Conversions API:</b> для оценки эффективности рекламы на публичных страницах работает Pixel Meta (Facebook/Instagram) — в Meta передаются события о просмотре страницы, просмотре товара и отправке формы. При отправке формы номер телефона передаётся в Meta только в <b>хешированном виде (SHA-256)</b>, а не открытым текстом. На страницах панели управления Pixel не работает. Рекламные настройки Meta можно изменить в разделе «Рекламные предпочтения» в Facebook/Instagram.</li>
    </ul></section>
    <section><h2>2. Зачем мы их используем</h2><ul>
      <li>Чтобы <b>отправить цену</b> интересующего товара (например, если вы написали «цена» в Instagram, цена придёт в Direct).</li>
      <li>Чтобы зарегистрировать запрос как <b>заявку (лид)</b> и передать специалисту отдела продаж.</li>
      <li>Чтобы <b>ответить</b> на ваш вопрос, связаться с вами, подготовить расчёт и коммерческое предложение.</li>
      <li>Для контроля качества обслуживания (время ответа, оставшиеся без ответа обращения) и отсеивания спама и оскорбительных комментариев.</li>
    </ul><p>Данные не используются для рекламного профилирования и автоматического принятия решений.</p></section>
    <section><h2>3. Кому передаются данные</h2>
      <p>Ваши персональные данные <b>не продаются и не передаются третьим лицам</b>. Доступ к ним есть только у уполномоченных сотрудников Компании (отдел продаж, администраторы). Для работы сервиса данные хранятся и обрабатываются у технических провайдеров: хостинг и база данных, Telegram (уведомления сотрудникам), Meta/Instagram (ответы в Direct и на комментарии, рекламные события — Pixel), а также AI-сервис для классификации текста — они не используют данные в своих целях. Передача государственным органам возможна только в случаях, предусмотренных законом.</p>
    </section>
    <section><h2>4. Срок хранения</h2><ul>
      <li>Записи комментариев и сообщений Direct из Instagram — <b>до 12 месяцев</b>, затем удаляются или обезличиваются.</li>
      <li>Данные заявок и клиентов — в период сотрудничества и <b>до 3 лет</b> после последнего обращения (гарантия, сервис, бухгалтерский учёт).</li>
      <li>По запросу на удаление — независимо от срока, <b>в течение 30 дней</b> (<Link href="/data-deletion?lang=ru">порядок удаления данных</Link>).</li>
    </ul></section>
    <section><h2>5. Безопасность</h2>
      <p>Сайт работает только по защищённому HTTPS. Вход в панель управления — только по паролю и с разграничением ролей; ключ доступа Instagram хранится в зашифрованном виде; входящие от Meta уведомления проверяются по подписи. Резервные копии также хранятся защищённо.</p>
    </section>
    <section><h2>6. Ваши права</h2>
      <p>Вы можете запросить доступ к своим данным, их исправление или удаление, а также отозвать согласие на обработку через Instagram (Instagram → Настройки → «Приложения и сайты» → удалить приложение). Подробнее: <Link href="/data-deletion?lang=ru">удаление данных</Link>.</p>
    </section>
    <section><h2>7. Контакты</h2>
      <p><b>{COMPANY.name}</b><br/>{COMPANY.city.ru}<br/>Телефон / Telegram: <a href={COMPANY.phoneHref}>{COMPANY.phone}</a></p>
      <p className="legal-note">При изменении политики новая редакция публикуется на этой странице, а дата выше обновляется.</p>
    </section>
  </div>;
}

export default async function PrivacyPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const lang: Lang = langOf((await searchParams).lang);
  return <LegalPage path="/privacy" lang={lang} eyebrow={lang === "ru" ? "Документы" : "Hujjatlar"} title={lang === "ru" ? "Политика конфиденциальности" : "Maxfiylik siyosati"} updated={UPDATED[lang]}>
    {lang === "ru" ? <Ru/> : <Uz/>}
  </LegalPage>;
}
