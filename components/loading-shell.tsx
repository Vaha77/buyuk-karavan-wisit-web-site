export function PublicLoadingShell({ detail = false }: { detail?: boolean }) {
  return <div className="route-loading" role="status" aria-label="Sahifa yuklanmoqda"><div className="route-loading-nav"><i/><span/><span/></div><main className="route-loading-main"><div className="route-loading-title"><i/><i/></div>{detail ? <div className="route-loading-detail"><div/><section><i/><i/><i/><i/></section></div> : <><div className="route-loading-search"/><div className="route-loading-grid">{Array.from({ length: 8 }, (_, index) => <div key={index}><i/><span/><span/></div>)}</div></>}</main><span className="sr-only">Yuklanmoqda…</span></div>;
}
export function AdminLoadingShell() {
  return <div className="admin-route-loading" role="status" aria-label="Admin sahifasi yuklanmoqda"><div className="admin-route-loading-heading"><i/><i/></div><div className="admin-route-loading-metrics">{Array.from({length:4},(_,index)=><i key={index}/>)}</div><div className="admin-route-loading-panel">{Array.from({length:5},(_,index)=><i key={index}/>)}</div><span className="sr-only">Yuklanmoqda…</span></div>;
}
