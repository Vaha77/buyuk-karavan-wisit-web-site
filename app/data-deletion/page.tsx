import type { Metadata } from "next";
import Link from "next/link";
import { COMPANY, LegalPage, langOf, type Lang } from "@/components/legal/legal-page";
import { getDeletionRequest } from "@/lib/instagram/data-deletion";
import { isConfirmationCode } from "@/lib/instagram/deletion-rules";

const UPDATED = { uz: "Oxirgi yangilanish: 12-oktabr 2026", ru: "Последнее обновление: 12 октября 2026" };

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ lang?: string; code?: string }> }): Promise<Metadata> {
  const params = await searchParams, lang = langOf(params.lang);
  return {
    title: lang === "ru" ? "Удаление данных — BUYUK KARAVAN" : "Ma’lumotni o‘chirish — BUYUK KARAVAN",
    description: lang === "ru" ? "Как удалить свои данные у Buyuk Karavan MChJ: запрос по телефону или Telegram, удаление приложения в Instagram, срок — 30 дней." : "Buyuk Karavan MChJ’dagi ma’lumotingizni o‘chirish: Telegram yoki telefon orqali so‘rov, Instagram’da ilovani o‘chirish, 30 kun ichida.",
    alternates: { canonical: lang === "ru" ? "/data-deletion?lang=ru" : "/data-deletion", languages: { uz: "/data-deletion", ru: "/data-deletion?lang=ru" } },
    // A status page with a code is personal: kept out of search results.
    ...(params.code ? { robots: { index: false, follow: false } } : {}),
  };
}

const fmt = (date: Date, lang: Lang) => new Intl.DateTimeFormat(lang === "ru" ? "ru-RU" : "uz-UZ", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Tashkent" }).format(date);

async function Status({ code, lang }: { code: string; lang: Lang }) {
  const ru = lang === "ru";
  const request = isConfirmationCode(code) ? await getDeletionRequest(code).catch(() => null) : null;
  if (!request) return <div className="legal-status is-bad" role="status"><h2>{ru ? "Запрос не найден" : "So‘rov topilmadi"}</h2><p>{ru ? `Код «${code.slice(0, 20)}» не найден. Проверьте код или свяжитесь с нами: ` : `“${code.slice(0, 20)}” kodi topilmadi. Kodni tekshiring yoki biz bilan bog‘laning: `}<a href={COMPANY.phoneHref}>{COMPANY.phone}</a></p></div>;
  const done = request.status === "COMPLETED";
  return <div className={`legal-status${done ? " is-ok" : ""}`} role="status">
    <h2>{done ? (ru ? "Данные удалены ✓" : "Ma’lumotlar o‘chirildi ✓") : (ru ? "Запрос принят, выполняется" : "So‘rov qabul qilindi, bajarilmoqda")}</h2>
    <dl>
      <div><dt>{ru ? "Код подтверждения" : "Tasdiqlash kodi"}</dt><dd>{request.code}</dd></div>
      <div><dt>{ru ? "Получен" : "Qabul qilingan"}</dt><dd>{fmt(request.requestedAt, lang)}</dd></div>
      <div><dt>{ru ? "Выполнен" : "Bajarilgan"}</dt><dd>{request.completedAt ? fmt(request.completedAt, lang) : "—"}</dd></div>
      <div><dt>{ru ? "Комментарии удалены" : "O‘chirilgan kommentlar"}</dt><dd>{request.comments}</dd></div>
      <div><dt>{ru ? "Сообщения Direct удалены" : "O‘chirilgan Direct xabarlar"}</dt><dd>{request.messages}</dd></div>
      <div><dt>{ru ? "Заявки обезличены" : "Anonimlashtirilgan lidlar"}</dt><dd>{request.leads}</dd></div>
    </dl>
    {!done && <p>{ru ? "Удаление завершается в течение 30 дней." : "O‘chirish 30 kun ichida yakunlanadi."}</p>}
  </div>;
}

function CodeForm({ lang }: { lang: Lang }) {
  const ru = lang === "ru";
  return <form className="legal-code" action="/data-deletion" method="get" aria-label={ru ? "Проверить статус" : "Holatni tekshirish"}>
    {ru && <input type="hidden" name="lang" value="ru"/>}
    <input name="code" required minLength={12} maxLength={12} placeholder={ru ? "Код подтверждения" : "Tasdiqlash kodi"} aria-label={ru ? "Код подтверждения" : "Tasdiqlash kodi"} autoComplete="off"/>
    <button type="submit">{ru ? "Проверить" : "Tekshirish"}</button>
  </form>;
}

function Uz() {
  return <div className="legal-card">
    <p><b>{COMPANY.name}</b> sizdan olingan shaxsiy ma’lumotlarni (sayt formasi, Madina AI chat, Instagram komment va Direct xabarlari, telefon raqami) so‘rovingiz bo‘yicha o‘chiradi. Qanday ma’lumot yig‘ilishi — <Link href="/privacy">Maxfiylik siyosati</Link>da.</p>
    <section><h2>1-usul. Telegram yoki telefon orqali</h2><ol>
      <li><a href={COMPANY.phoneHref}>{COMPANY.phone}</a> raqamiga qo‘ng‘iroq qiling yoki shu raqamga Telegram’da yozing.</li>
      <li>Ma’lumotni topishimiz uchun ayting: ismingiz, telefon raqamingiz va/yoki Instagram username’ingiz.</li>
      <li>So‘rov qabul qilinganini tasdiqlaymiz va <b>30 kun ichida</b> ma’lumotni o‘chiramiz, natijasini sizga xabar qilamiz.</li>
    </ol></section>
    <section><h2>2-usul. Instagram orqali</h2><ol>
      <li>Instagram ilovasida: Profil → ☰ → <b>Sozlamalar va faollik</b> → <b>Ilovalar va saytlar</b> (rus tilida: «Приложения и сайты»).</li>
      <li>Ro‘yxatdan bizning ilovamizni tanlang va <b>O‘chirish</b> tugmasini bosing; ma’lumotni o‘chirish so‘rovini tasdiqlang.</li>
      <li>Instagram so‘rovni bizga avtomatik yuboradi: kommentlaringiz va Direct xabarlaringiz yozuvlari o‘chiriladi, ular asosida ochilgan lidlar anonimlashtiriladi (ism, telefon, izohlar olib tashlanadi). Instagram sizga tasdiqlash kodini beradi — holatni pastda tekshirishingiz mumkin.</li>
    </ol></section>
    <section><h2>Nima o‘chiriladi</h2><ul>
      <li>Instagram komment va Direct xabarlari yozuvlari, suhbat tarixi — to‘liq o‘chiriladi.</li>
      <li>Lid (murojaat) yozuvlari — ism, telefon, Telegram, chat va izohlar olib tashlanadi; faqat shaxssiz statistika qoladi (sana, mahsulot, holat).</li>
      <li>Qonun bo‘yicha saqlanishi shart bo‘lgan hujjatlar (masalan, sotuv hujjatlari) — qonundagi muddat tugaguncha saqlanadi.</li>
    </ul><p>Barcha so‘rovlar <b>30 kun ichida</b> bajariladi.</p></section>
    <section><h2>So‘rov holatini tekshirish</h2><CodeForm lang="uz"/></section>
  </div>;
}

function Ru() {
  return <div className="legal-card">
    <p><b>{COMPANY.name}</b> удаляет полученные от вас персональные данные (формы сайта, чат с ассистентом Мадина, комментарии и сообщения Direct в Instagram, номер телефона) по вашему запросу. Какие данные собираются — в <Link href="/privacy?lang=ru">Политике конфиденциальности</Link>.</p>
    <section><h2>Способ 1. Через Telegram или по телефону</h2><ol>
      <li>Позвоните по номеру <a href={COMPANY.phoneHref}>{COMPANY.phone}</a> или напишите на этот номер в Telegram.</li>
      <li>Чтобы мы нашли данные, укажите: имя, номер телефона и/или username в Instagram.</li>
      <li>Мы подтвердим получение запроса, удалим данные <b>в течение 30 дней</b> и сообщим вам о результате.</li>
    </ol></section>
    <section><h2>Способ 2. Через Instagram</h2><ol>
      <li>В приложении Instagram: Профиль → ☰ → <b>Настройки и действия</b> → <b>Приложения и сайты</b>.</li>
      <li>Выберите наше приложение и нажмите <b>Удалить</b>; подтвердите запрос на удаление данных.</li>
      <li>Instagram автоматически передаст нам запрос: записи ваших комментариев и сообщений Direct будут удалены, а созданные по ним заявки — обезличены (имя, телефон, примечания удаляются). Instagram выдаст вам код подтверждения — статус можно проверить ниже.</li>
    </ol></section>
    <section><h2>Что удаляется</h2><ul>
      <li>Записи комментариев и сообщений Direct в Instagram, история переписки — удаляются полностью.</li>
      <li>Заявки (обращения) — удаляются имя, телефон, Telegram, чат и примечания; остаётся только обезличенная статистика (дата, товар, статус).</li>
      <li>Документы, которые по закону обязаны храниться (например, документы о продаже), — хранятся до окончания установленного срока.</li>
    </ul><p>Все запросы выполняются <b>в течение 30 дней</b>.</p></section>
    <section><h2>Проверить статус запроса</h2><CodeForm lang="ru"/></section>
  </div>;
}

export default async function DataDeletionPage({ searchParams }: { searchParams: Promise<{ lang?: string; code?: string }> }) {
  const params = await searchParams, lang: Lang = langOf(params.lang);
  const code = params.code?.trim().toUpperCase().slice(0, 32);
  return <LegalPage path="/data-deletion" lang={lang} eyebrow={lang === "ru" ? "Документы" : "Hujjatlar"} title={lang === "ru" ? "Удаление данных" : "Ma’lumotni o‘chirish"} updated={UPDATED[lang]}>
    {code && <Status code={code} lang={lang}/>}
    {lang === "ru" ? <Ru/> : <Uz/>}
  </LegalPage>;
}
