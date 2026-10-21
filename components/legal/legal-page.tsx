import type { ReactNode } from "react";
import Link from "next/link";
import { Header } from "@/components/home/navigation";
import { Footer } from "@/components/home/home-page";
import "@/components/products/products.css";
import "./legal.css";

export type Lang = "uz" | "ru";
export const langOf = (value: string | undefined): Lang => value === "ru" ? "ru" : "uz";
export const COMPANY = { name: "Buyuk Karavan MChJ", phone: "+998 91 637 77 77", phoneHref: "tel:+998916377777", city: { uz: "Namangan, O‘zbekiston", ru: "Наманган, Узбекистан" } } as const;

/** Site header + footer around a legal text, with the O‘zbekcha / Русский switch (?lang=ru). */
export function LegalPage({ path, lang, eyebrow, title, updated, children }: { path: string; lang: Lang; eyebrow: string; title: string; updated: string; children: ReactNode }) {
  return <div className="products-shell"><Header onProducts/>
    <main className="legal-page" lang={lang}>
      <div className="legal-wrap">
        <div className="legal-head rv">
          <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{updated}</p></div>
          <nav className="legal-lang" aria-label="Til / Язык">
            <Link href={path} aria-current={lang === "uz"} hrefLang="uz">O‘zbekcha</Link>
            <Link href={`${path}?lang=ru`} aria-current={lang === "ru"} hrefLang="ru">Русский</Link>
          </nav>
        </div>
        {children}
      </div>
    </main>
    <Footer onProducts/></div>;
}
