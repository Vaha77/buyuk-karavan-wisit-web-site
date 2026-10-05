import "server-only";
/* eslint-disable jsx-a11y/alt-text -- @react-pdf/renderer Image has no HTML alt prop */
import path from "node:path";
import React from "react";
import { Document, Font, Image, Line, Page, Path, Rect, Svg, Text, View, pdf, StyleSheet } from "@react-pdf/renderer";
import { quotationTotals } from "./money";
import type { CalculationDraft, PlannerRoom } from "./types";
import type { UsdUzsRate } from "../currency/cbu";

Font.register({family:"NotoSans",fonts:[
  {src:path.join(process.cwd(),"node_modules/@fontsource/noto-sans/files/noto-sans-cyrillic-400-normal.woff"),fontWeight:400},
  {src:path.join(process.cwd(),"node_modules/@fontsource/noto-sans/files/noto-sans-cyrillic-600-normal.woff"),fontWeight:600},
  {src:path.join(process.cwd(),"node_modules/@fontsource/noto-sans/files/noto-sans-cyrillic-700-normal.woff"),fontWeight:700},
  {src:path.join(process.cwd(),"node_modules/@fontsource/noto-sans/files/noto-sans-cyrillic-400-italic.woff"),fontWeight:400,fontStyle:"italic"},
]});
const color={purple:"#4b2677",red:"#a12028",wall:"#77343a",green:"#397243",cyan:"#53b5cf",pink:"#f5dfe5",blue:"#e5f1f7",mint:"#e4f2e8",line:"#806b75",ink:"#2f2630"};
const styles=StyleSheet.create({
  page:{fontFamily:"NotoSans",fontSize:7.2,color:color.ink,padding:22,paddingBottom:28},
  header:{flexDirection:"row",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8},
  proposalTitle:{width:"78%",color:color.purple,fontSize:9.5,fontWeight:700,letterSpacing:.35},
  tonnage:{color:color.red,fontSize:17,fontWeight:700,textAlign:"right"},
  render:{height:110,objectFit:"contain",marginBottom:7},
  mainTitle:{textAlign:"center",color:color.purple,fontSize:12,fontWeight:700,letterSpacing:2.1,marginVertical:7},
  planBox:{height:225,marginBottom:8},
  tableHeader:{flexDirection:"row",backgroundColor:color.pink,borderTop:`1px solid ${color.line}`,borderLeft:`1px solid ${color.line}`},
  tableRow:{flexDirection:"row",borderLeft:`1px solid ${color.line}`,backgroundColor:"#fff"},
  alternate:{backgroundColor:color.blue},
  cell:{padding:3,borderRight:`1px solid ${color.line}`,borderBottom:`1px solid ${color.line}`},
  no:{width:"5%",textAlign:"center"},name:{width:"39%",fontStyle:"italic"},unit:{width:"12%",textAlign:"center"},qty:{width:"12%",textAlign:"right"},price:{width:"16%",textAlign:"right"},total:{width:"16%",textAlign:"right"},
  totals:{marginLeft:"55%",marginTop:5},totalRow:{flexDirection:"row",justifyContent:"space-between",padding:3,borderBottom:`.6px solid ${color.line}`},
  vat:{marginTop:5,padding:5,backgroundColor:color.mint,flexDirection:"row",justifyContent:"space-between",fontWeight:700},
  note:{marginTop:7,color:color.red,fontSize:7.4,lineHeight:1.35},validity:{marginTop:4,color:color.purple,fontWeight:600},
  footer:{position:"absolute",bottom:12,left:22,right:22,flexDirection:"row",justifyContent:"space-between",fontSize:6,color:"#736778"},
});
const fmt=(value:number,max=2)=>new Intl.NumberFormat("ru-RU",{maximumFractionDigits:max}).format(value);
const usd=(value:number)=>`${fmt(value,2)} USD`;
const date=(value:string)=>new Intl.DateTimeFormat("ru-RU",{timeZone:"UTC"}).format(new Date(`${value}T00:00:00Z`));
const volume=(room:PlannerRoom)=>room.width*room.length*room.height;
function doorPath(room:PlannerRoom,x:number,y:number,s:number){const left=x+room.x*s,top=y+room.y*s,w=room.width*s,h=room.length*s,gap=Math.min(w,h)*.28;if(room.doorSide==="TOP")return`M ${left+w/2-gap/2} ${top} L ${left+w/2+gap/2} ${top}`;if(room.doorSide==="LEFT")return`M ${left} ${top+h/2-gap/2} L ${left} ${top+h/2+gap/2}`;if(room.doorSide==="RIGHT")return`M ${left+w} ${top+h/2-gap/2} L ${left+w} ${top+h/2+gap/2}`;return`M ${left+w/2-gap/2} ${top+h} L ${left+w/2+gap/2} ${top+h}`;}
function Plan({draft}:{draft:CalculationDraft}){const W=550,H=220,p=22,s=Math.min((W-p*2)/draft.buildingWidth,(H-p*2)/draft.buildingLength),ox=(W-draft.buildingWidth*s)/2,oy=(H-draft.buildingLength*s)/2;return <Svg viewBox={`0 0 ${W} ${H}`} style={styles.planBox}>
  <Rect x={ox} y={oy} width={draft.buildingWidth*s} height={draft.buildingLength*s} fill="#fff" stroke={color.wall} strokeWidth={3}/>
  <Line x1={ox} y1={oy-12} x2={ox+draft.buildingWidth*s} y2={oy-12} stroke={color.cyan} strokeWidth={.8}/><Text x={W/2} y={oy-15} style={{fontSize:7,textAnchor:"middle",fill:color.cyan}}>{fmt(draft.buildingWidth)}м</Text>
  <Line x1={ox-12} y1={oy} x2={ox-12} y2={oy+draft.buildingLength*s} stroke={color.cyan} strokeWidth={.8}/><Text x={ox-16} y={H/2} style={{fontSize:7,textAnchor:"middle",fill:color.cyan}} transform={`rotate(-90 ${ox-16} ${H/2})`}>{fmt(draft.buildingLength)}м</Text>
  {draft.rooms.map(room=>{const x=ox+room.x*s,y=oy+room.y*s,w=room.width*s,h=room.length*s,lines=room.type==="CORRIDOR"?["Коридор"]:[room.name,`H-${fmt(room.height)}м · ${fmt(volume(room),1)}м³`,`${fmt(room.temperatureMin)} / ${fmt(room.temperatureMax)}°C`,room.capacityTons>0?`${fmt(room.capacityTons)} тонн`:"",room.equipmentModel].filter(Boolean),font=Math.max(4.2,Math.min(7,w/11)),visible=lines.slice(0,Math.max(1,Math.floor((h-8)/(font*1.35))));return <React.Fragment key={room.id}><Rect x={x} y={y} width={w} height={h} fill={room.type==="CORRIDOR"?"#f2edf6":"#fff"} stroke={color.wall} strokeWidth={2}/>{visible.map((line,index)=><Text key={line} x={x+w/2} y={y+h/2-((visible.length-1)*font*1.25)/2+index*font*1.25} style={{fontSize:font,textAnchor:"middle",fill:room.type==="CORRIDOR"?color.purple:color.green,fontWeight:index===0?700:400}}>{line}</Text>)}<Text x={x+w/2} y={y-3} style={{fontSize:5.8,textAnchor:"middle",fill:color.cyan}}>{fmt(room.width)}м</Text><Text x={x+3} y={y+h/2} style={{fontSize:5.8,textAnchor:"middle",fill:color.cyan}} transform={`rotate(-90 ${x+3} ${y+h/2})`}>{fmt(room.length)}м</Text>{room.doorEnabled&&<Path d={doorPath(room,ox,oy,s)} stroke={color.cyan} strokeWidth={4}/>}</React.Fragment>})}
  </Svg>}
function Proposal({draft}:{draft:CalculationDraft}){const totals=quotationTotals(draft.lineItems,draft.discountPercent),cameras=draft.rooms.filter(room=>room.type==="ROOM"),tons=cameras.reduce((sum,room)=>sum+(room.capacityTons>0?room.capacityTons:0),0);return <Document title={`${draft.proposalNumber} — ${draft.projectName}`} author="BUYUK KARAVAN"><Page size="A4" style={styles.page} wrap>
  <View style={styles.header}><Text style={styles.proposalTitle}>ПРЕДВАРИТЕЛЬНОЕ КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ {draft.proposalNumber||""} от {date(draft.proposalDate)} г.</Text>{tons>0&&<Text style={styles.tonnage}>{fmt(tons)} тонн</Text>}</View>
  {draft.renderImageUrl&&<Image src={draft.renderImageUrl} style={styles.render}/>}<Text style={styles.mainTitle}>{draft.rooms.length?"ПРОЕКТ-СМЕТА ХОЛОДИЛЬНЫХ КАМЕР":"КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ"}</Text>{draft.rooms.length>0&&<Plan draft={draft}/>}
  <View style={styles.tableHeader} wrap={false}>{[
    {label:"№",style:styles.no},{label:"Наименование товаров и услуг",style:styles.name},{label:"Един. измер",style:styles.unit},{label:"Количество",style:styles.qty},{label:"Цена за единицу",style:styles.price},{label:"Общая сумма",style:styles.total},
  ].map(column=><Text key={column.label} style={[styles.cell,column.style]}>{column.label}</Text>)}</View>
  {draft.lineItems.map((item,index)=>{const result=quotationTotals([item],0),row=result[item.currency==="USD"?"usdTotal":"uzsTotal"];return <View key={item.id} style={[styles.tableRow,index%2?styles.alternate:{}]} wrap={false}><Text style={[styles.cell,styles.no]}>{index+1}</Text><Text style={[styles.cell,styles.name]}>{item.name}</Text><Text style={[styles.cell,styles.unit]}>{item.unit}</Text><Text style={[styles.cell,styles.qty]}>{fmt(item.quantity,3)}</Text><Text style={[styles.cell,styles.price]}>{fmt(item.unitPrice,2)} {item.currency}</Text><Text style={[styles.cell,styles.total]}>{fmt(row,2)} {item.currency}</Text></View>})}
  <View style={styles.totals} wrap={false}><View style={styles.totalRow}><Text>Всего: без НДС</Text><Text>{usd(totals.usdTotal)}</Text></View>{totals.uzsTotal>0&&<View style={styles.totalRow}><Text>Итого UZS</Text><Text>{fmt(totals.uzsTotal)} сум</Text></View>}</View>
  {draft.manualUzsTotalWithVat!==null&&<View style={styles.vat} wrap={false}><Text>Перечисления с учётом НДС</Text><Text>{fmt(draft.manualUzsTotalWithVat)} сум</Text></View>}
  {draft.proposalNote&&<Text style={styles.note}>PS. {draft.proposalNote}</Text>}{draft.validityDays&&<Text style={styles.validity}>Цены действуют в течение {draft.validityDays} дней.</Text>}
  <View style={styles.footer} fixed><Text>BUYUK KARAVAN · {draft.proposalNumber}</Text><Text render={({pageNumber,totalPages})=>`${pageNumber} / ${totalPages}`}/></View>
  </Page></Document>}
export async function renderProposalPdf(draft:CalculationDraft,rate:UsdUzsRate|null){void rate;return pdf(<Proposal draft={draft}/>).toBuffer();}
