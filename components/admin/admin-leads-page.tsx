"use client";

import { useMemo, useState } from "react";
import { mockLeads, type Lead, type LeadStatus } from "@/data/leads";
import { LeadDrawer, LeadFilters, LeadMobileCard, LeadStats, LeadTable, type LeadFiltersState } from "./lead-components";

const initialFilters: LeadFiltersState = { query:"", status:"all", date:"all", region:"all", requestType:"all" };
export function AdminLeadsPage() {
  const [records,setRecords]=useState<Lead[]>(mockLeads);
  const [filters,setFilters]=useState<LeadFiltersState>(initialFilters);
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const selected=records.find(lead=>lead.id===selectedId);
  const visible=useMemo(()=>records.filter(lead=>{
    const query=filters.query.trim().toLocaleLowerCase();
    return (!query||`${lead.customerName} ${lead.phone} ${lead.requestType} ${lead.product}`.toLocaleLowerCase().includes(query))
      && (filters.status==="all"||lead.status===filters.status)
      && (filters.date==="all"||lead.dateGroup===filters.date)
      && (filters.region==="all"||lead.region===filters.region)
      && (filters.requestType==="all"||lead.requestType===filters.requestType);
  }),[records,filters]);
  const update=(id:string,patch:Partial<Lead>)=>setRecords(current=>current.map(lead=>lead.id===id?{...lead,...patch}:lead));
  const open=(id:string)=>{setSelectedId(id);update(id,{isUnread:false});};
  return <div className="admin-leads-page"><div className="admin-page-heading"><div><h1>Mijoz so‘rovlari</h1><p>Madina AI orqali kelgan mijoz murojaatlari</p></div></div>
    <LeadStats leads={records}/>
    <section className="admin-panel lead-panel"><div className="admin-panel-heading"><h2>So‘rovlar ro‘yxati</h2><span>{visible.length} ta murojaat</span></div><LeadFilters value={filters} onChange={setFilters} leads={records}/>
      {visible.length ? <><LeadTable leads={visible} onOpen={open}/><div className="lead-mobile-list">{visible.map(lead=><LeadMobileCard key={lead.id} lead={lead} onOpen={open}/>)}</div></> : <p className="admin-empty">Filtrlarga mos so‘rov topilmadi.</p>}
    </section>
    {selected&&<LeadDrawer key={selected.id} lead={selected} onClose={()=>setSelectedId(null)} onStatusChange={(status:LeadStatus)=>update(selected.id,{status})} onSaveNote={managerNote=>update(selected.id,{managerNote})}/>}
  </div>;
}
