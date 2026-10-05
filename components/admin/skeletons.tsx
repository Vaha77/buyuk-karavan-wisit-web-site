// Skeleton screens for loading.tsx: grey blocks shaped like each section (styles in feedback.css).
import type { CSSProperties, ReactNode } from "react";

function Sk({ w = "100%", h = 14, round = false, style }: { w?: number | string; h?: number; round?: boolean; style?: CSSProperties }) {
  return <span className={`sk${round ? " is-round" : ""}`} style={{ width: w, height: h, ...style }}/>;
}
const times = (count: number) => Array.from({ length: count }, (_, index) => index);

function Page({ label, children }: { label: string; children: ReactNode }) {
  return <div className="sk-page" role="status" aria-label={label}>{children}<span className="sr-only">Yuklanmoqda…</span></div>;
}
function Heading({ actions = 2 }: { actions?: number }) {
  return <div className="sk-row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
    <div style={{ display: "grid", gap: 8, flex: "1 1 260px" }}><Sk w={120} h={12}/><Sk w="min(320px, 80%)" h={28}/><Sk w="min(420px, 95%)" h={13}/></div>
    <div className="sk-row">{times(actions).map(index => <Sk key={index} w={130} h={42}/>)}</div>
  </div>;
}
function Stats({ count, height = 92 }: { count: number; height?: number }) {
  return <div className="sk-grid">{times(count).map(index => <div key={index} className="sk-card" style={{ height, justifyContent: "center" }}><Sk w="55%" h={12}/><Sk w="40%" h={26}/></div>)}</div>;
}
function TableRows({ rows, columns = 6 }: { rows: number; columns?: number }) {
  return <div className="sk-table">{times(rows).map(row => <div key={row} className="sk-row" style={{ flexWrap: "nowrap", padding: "12px 0", borderBottom: "1px solid #EEF1F6" }}>{times(columns).map(column => <Sk key={column} w={column === 1 ? "28%" : `${Math.max(8, 70 / columns)}%`} h={14}/>)}</div>)}</div>;
}
function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div className="sk-card" style={style}>{children}</div>;
}
function Chips({ count }: { count: number }) {
  return <div className="sk-row">{times(count).map(index => <Sk key={index} w={index ? 84 : 70} h={34} round/>)}</div>;
}

/** Fallback for every admin page without its own skeleton; shaped like the dashboard. */
export function GenericSkeleton() {
  return <Page label="Sahifa yuklanmoqda"><Heading actions={1}/><Stats count={4}/>
    <div className="sk-split"><div className="sk-main"><Card style={{ height: 300 }}><Sk w={180} h={16}/><Sk h={230}/></Card></div><div className="sk-side"><Card style={{ height: 300 }}><Sk w={150} h={16}/>{times(5).map(index => <Sk key={index} w={`${90 - index * 14}%`} h={18}/>)}</Card></div></div>
    <Card><Sk w={200} h={16}/><TableRows rows={5}/></Card>
  </Page>;
}

/** /admin/sex: heading, four counters, orders table. */
export function SexListSkeleton() {
  return <Page label="Sex zakazlari yuklanmoqda"><Heading actions={3}/><Stats count={4} height={78}/>
    <Card><div className="sk-table">{times(5).map(row => <div key={row} className="sk-table-row">
      <Sk w={46} h={14}/><Sk w={50} h={13}/><Sk w={64} h={20}/><div style={{ display: "grid", gap: 6 }}><Sk w="90%" h={14}/><Sk w="55%" h={11}/></div>
      <div style={{ display: "grid", gap: 6 }}><Sk w="80%" h={13}/><Sk w="50%" h={11}/></div><Sk w="75%" h={13}/>
      <div style={{ display: "grid", gap: 5 }}>{times(3).map(index => <Sk key={index} w="85%" h={10}/>)}</div><Sk w={96} h={24} round/><Sk w={110} h={38}/>
    </div>)}</div></Card>
  </Page>;
}

/** /admin/sex/new: three form cards and the order card on the right. */
export function SexNewSkeleton() {
  return <Page label="Buyurtma formasi yuklanmoqda"><Heading actions={2}/>
    <div className="sk-split">
      <div className="sk-main">
        <Card><Sk w={200} h={12}/><div className="sk-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}><div style={{ display: "grid", gap: 6 }}><Sk w={60} h={12}/><Sk h={48}/></div><div style={{ display: "grid", gap: 6 }}><Sk w={90} h={12}/><Sk h={48}/></div></div></Card>
        <Card><Sk w={160} h={12}/><div className="sk-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>{times(4).map(index => <Sk key={index} h={76} style={{ borderRadius: 12 }}/>)}</div><Sk h={46}/></Card>
        <Card><Sk w={190} h={12}/><div className="sk-grid">{times(2).map(index => <Sk key={index} h={44}/>)}</div><div className="sk-grid" style={{ gridTemplateColumns: "repeat(2,minmax(0,1fr))" }}>{times(2).map(index => <Sk key={index} h={64} style={{ borderRadius: 12 }}/>)}</div><Sk h={44}/></Card>
      </div>
      <div className="sk-side">
        <Card style={{ border: "2px solid #C9D3E6" }}><Sk w={90} h={12}/><Sk w="85%" h={22}/>{times(3).map(index => <Sk key={index} h={16}/>)}<Sk w="60%" h={30} style={{ marginLeft: "auto" }}/><Sk h={52} style={{ borderRadius: 12 }}/></Card>
        <Card style={{ background: "#E7EEF5", border: 0 }}><Sk w={170} h={12}/><Sk h={130} style={{ background: "#fff" }}/></Card>
      </div>
    </div>
  </Page>;
}

/** /admin/prays: four buttons, four cards, the price table with tabs/chips and the history panel. */
export function PraysSkeleton() {
  return <Page label="Prays yuklanmoqda"><Heading actions={4}/><Stats count={4}/>
    <div className="sk-split">
      <div className="sk-main"><Card><div className="sk-row" style={{ justifyContent: "space-between" }}><Sk w={320} h={46} style={{ borderRadius: 12 }}/><Sk w={260} h={42}/></div><Chips count={4}/><TableRows rows={8} columns={6}/></Card></div>
      <div className="sk-side"><Card><Sk w={110} h={16}/>{times(4).map(index => <div key={index} style={{ display: "grid", gap: 6, paddingTop: 10, borderTop: "1px solid #EEF1F6" }}><Sk w="70%" h={13}/><Sk w="90%" h={11}/><Sk w="40%" h={11}/></div>)}</Card></div>
    </div>
  </Page>;
}

/** /admin/customers: year chips, five KPIs, regions map, ranking. */
export function CustomersSkeleton() {
  return <Page label="Doimiy mijozlar yuklanmoqda"><div className="sk-row" style={{ justifyContent: "space-between" }}><div style={{ display: "grid", gap: 8 }}><Sk w={300} h={26}/><Sk w={380} h={13}/></div><Chips count={4}/></div>
    <Stats count={5}/>
    <div className="sk-split"><div className="sk-main"><Card style={{ height: 380 }}><Sk w={220} h={16}/><Sk h={310}/></Card></div><div className="sk-side"><Card style={{ height: 380 }}><Sk w={140} h={16}/>{times(8).map(index => <Sk key={index} h={22}/>)}</Card></div></div>
    <Card><Sk w={200} h={16}/><TableRows rows={6} columns={5}/></Card>
  </Page>;
}

/** /admin/sales-plan: period select, zone legend, summary and the plan board. */
export function SalesPlanSkeleton() {
  return <Page label="Sotuv rejasi yuklanmoqda"><Heading actions={3}/><Chips count={6}/><Stats count={4} height={84}/>
    <Card>{times(6).map(index => <div key={index} className="sk-row" style={{ flexWrap: "nowrap", padding: "10px 0", borderBottom: "1px solid #EEF1F6" }}><Sk w={150} h={14}/><Sk w="45%" h={16} round/><Sk w={70} h={14}/><Sk w={70} h={14}/></div>)}</Card>
  </Page>;
}

/** /admin/my: greeting, rank card, four KPIs, own-region map and customers. */
export function MySkeleton() {
  return <Page label="Mening mijozlarim yuklanmoqda"><Heading actions={1}/><Card style={{ height: 120, justifyContent: "center" }}><Sk w="40%" h={22}/><Sk w="65%" h={14}/></Card><Stats count={4}/>
    <Card style={{ height: 320 }}><Sk w={200} h={16}/><Sk h={250}/></Card>
    <Card><Sk w={140} h={16}/>{times(6).map(index => <div key={index} className="sk-row" style={{ flexWrap: "nowrap" }}><Sk w={36} h={36} round/><Sk w="40%" h={14}/><Sk w="20%" h={12}/></div>)}</Card>
  </Page>;
}

/** Between admin sections that use different layouts the whole shell re-renders: sidebar and header placeholders keep the frame steady. */
export function ShellSkeleton() {
  return <div className="sk-shell"><aside className="sk-shell-side"><Sk w={150} h={26}/><Sk w={60} h={10}/>{times(10).map(index => <Sk key={index} h={30} style={{ opacity: 0.8 }}/>)}</aside>
    <div className="sk-shell-main"><div className="sk-shell-top"><div style={{ display: "grid", gap: 6, flex: 1 }}><Sk w={180} h={16}/><Sk w={260} h={11}/></div><Sk w={36} h={36} round/></div><div className="sk-shell-body"><GenericSkeleton/></div></div>
  </div>;
}
