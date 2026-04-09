'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';

// ── TYPES ─────────────────────────────────────────────────────────────────────
type TopMode    = 'keywords' | 'asins';
type AnalyzeBy  = 'search_term' | 'keyword' | 'targeting';
type AdType     = 'sp' | 'sb' | 'both';
type BrandMode  = 'non-branded' | 'both' | 'branded';
type FilterType = 'none' | 'eq' | 'gt' | 'lt' | 'between';
type SortKpi    = 'spend'|'impressions'|'clicks'|'ctr'|'orders'|'cvr'|'cpc'|'sales'|'acos'|'roas';
type SortDir    = 'desc'|'asc';
type DateOption = { value:string; label:string };

type STARow = {
  term:string;
  impressions:number; clicks:number; ctr:number;
  orders:number; cvr:number; cpc:number;
  spend:number; sales:number; acos:number; roas:number;
  impDelta:number|null; clkDelta:number|null; ctrDelta:number|null;
  ordDelta:number|null; cvrDelta:number|null; cpcDelta:number|null;
  spendDelta:number|null; salesDelta:number|null;
  acosDelta:number|null; roasDelta:number|null;
};
type SqpData = {
  searchVolume:number; searchVolumeDelta:number|null;
  impressionShare:number; impressionShareDelta:number|null;
  clickShare:number; clickShareDelta:number|null;
  cartShare:number; cartShareDelta:number|null;
  purchaseShare:number; purchaseShareDelta:number|null;
  revenueShare:number; revenueShareDelta:number|null;
}|null;

type KpiRow = {
  impressions:number; clicks:number; ctr:number; orders:number; cvr:number;
  cpc:number; spend:number; sales:number; acos:number; roas:number;
  pctSpend:number; pctSales:number;
  impDelta:number|null; clkDelta:number|null; ctrDelta:number|null;
  ordDelta:number|null; cvrDelta:number|null; cpcDelta:number|null;
  spendDelta:number|null; salesDelta:number|null;
  acosDelta:number|null; roasDelta:number|null;
};
type ShowDataRow = KpiRow & {
  dateKey:string; label:string;
  searchVolume?:number; searchVolumeDelta?:number|null;
  impressionShare?:number; impressionShareDelta?:number|null;
  clickShare?:number; clickShareDelta?:number|null;
  cartShare?:number; cartShareDelta?:number|null;
  purchaseShare?:number; purchaseShareDelta?:number|null;
  revenueShare?:number; revenueShareDelta?:number|null;
};

// Family Distribution — 4 levels
type CampKpiRow = KpiRow & { campaignName:string };
type MTKpiRow   = KpiRow & { matchType:string; campaigns:CampKpiRow[] };
type AdKpiRow   = KpiRow & { adType:string; matchTypes:MTKpiRow[] };
type FamilyRow  = KpiRow & { familyName:string; adTypes:AdKpiRow[] };

// MTA 1.0
type Mto1Match  = KpiRow & { matchType:string };
type Mto1AdType = KpiRow & { adType:string; matchTypes:Mto1Match[] };

// MTA 2.0
type MTRow = KpiRow & { matchType:string; adTypes:string[]; campaigns:(KpiRow&{campaignName:string;adType:string})[] };

// Show Data
type ShowDataConfig = {
  title: string;
  adType?: string;
  matchType?: string;
  campaignName?: string;
  term?: string;
};

// ── FORMAT HELPERS ─────────────────────────────────────────────────────────────
const fmtK   = (n:number) => n>=1e6?`${(n/1e6).toFixed(1)}M`:n>=1e3?`${(n/1e3).toFixed(1)}K`:n.toLocaleString();
const fmtCcy = (n:number) => n>=1000?`$${(n/1000).toFixed(1)}K`:`$${n.toFixed(2)}`;
const fmtPct = (n:number) => `${n.toFixed(2)}%`;
const fmtX   = (n:number) => `${n.toFixed(2)}x`;
const SORT_KPI_LABELS: Record<SortKpi,string> = { spend:'Spend',impressions:'Impressions',clicks:'Clicks',ctr:'CTR%',orders:'Orders',cvr:'CVR%',cpc:'CPC',sales:'Sales',acos:'ACoS%',roas:'ROAS' };
const PCT_KPIS = new Set<SortKpi>(['ctr','cvr','acos']);
const CCY_KPIS = new Set<SortKpi>(['cpc','spend','sales']);
const getKV = (r:STARow,k:SortKpi) => ({impressions:r.impressions,clicks:r.clicks,ctr:r.ctr,orders:r.orders,cvr:r.cvr,cpc:r.cpc,spend:r.spend,sales:r.sales,acos:r.acos,roas:r.roas}[k]);

// ── LEVEL BACKGROUND COLOURS ───────────────────────────────────────────────────
const BG_L1   = '#2c2c2f';
const BG_L1H  = '#323235';
const BG_L2   = '#232325';
const BG_L2H  = '#292929';
const BG_L3   = '#1e1e20';
const BG_L3H  = '#222224';
const BG_L4   = '#191919';
const BG_L4H  = '#1d1d1d';
const BG_TOT  = '#131313';

// Left border accents per level
const LB_L1 = '3px solid #52525b';
const LB_L2 = '3px solid #3f3f46';
const LB_L3 = '3px solid #2d2d2f';
const LB_L4 = '3px solid #222224';

// ── WoW BADGE ──────────────────────────────────────────────────────────────────
function WB({ val,inv=false,isPP=false }: { val:number|null;inv?:boolean;isPP?:boolean }) {
  if (val==null||Math.abs(val)<0.001) return <div style={{fontSize:10,color:'#52525b',textAlign:'center'}}>—</div>;
  const good=inv?val<0:val>0;
  const color=good?'#4ade80':'#f87171';
  const sign=val>=0?'↑ +':'↓ ';
  const lbl=isPP?`${sign}${Math.abs(val).toFixed(2)}pp`:`${sign}${Math.abs(val).toFixed(1)}%`;
  return <div style={{fontSize:10,fontWeight:600,color,textAlign:'center'}}>{lbl}</div>;
}

// ── KPI CELL ───────────────────────────────────────────────────────────────────
function KC({ main,wow,inv=false,isPP=false,yellow=false,sz=12 }:
  { main:string;wow:number|null;inv?:boolean;isPP?:boolean;yellow?:boolean;sz?:number }) {
  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:1}}>
      <div style={{fontSize:sz,fontWeight:700,color:yellow?'#fbbf24':'#e4e4e7',textAlign:'center'}}>{main}</div>
      <WB val={wow} inv={inv} isPP={isPP}/>
    </div>
  );
}

// ── SHOW DATA BUTTON ───────────────────────────────────────────────────────────
function SDB({ onClick }: { onClick:()=>void }) {
  return (
    <button onClick={e=>{e.stopPropagation();onClick();}}
      style={{fontSize:10,fontWeight:700,color:'#f97316',background:'transparent',border:'1px solid #52525b',borderRadius:5,padding:'3px 9px',cursor:'pointer',whiteSpace:'nowrap'}}
      onMouseEnter={e=>{(e.currentTarget as HTMLButtonElement).style.borderColor='#f97316';}}
      onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.borderColor='#52525b';}}>
      Show Data
    </button>
  );
}

// ── COPY CELL ─────────────────────────────────────────────────────────────────
// Shows a clipboard copy button on hover. Cell width never changes.
function CopyCell({ text, fontSize=12, fontWeight=700, color='#fff', maxWidth=260, mono=false }:
  { text:string; fontSize?:number; fontWeight?:number; color?:string; maxWidth?:number; mono?:boolean }) {
  const [hovered, setHovered]  = React.useState(false);
  const [copied,  setCopied]   = React.useState(false);
  const copy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(()=>setCopied(false),1500); });
  };
  return (
    <div style={{display:'flex',alignItems:'center',gap:5,minWidth:0}}
      onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)}>
      <span style={{fontSize,fontWeight,color,fontFamily:mono?'monospace':'inherit',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth}} title={text}>{text}</span>
      {hovered && (
        <button onClick={copy} title="Copy to clipboard"
          style={{flexShrink:0,width:18,height:18,display:'flex',alignItems:'center',justifyContent:'center',
            background:copied?'#14532d':'#27272a',border:`1px solid ${copied?'#4ade80':'#3f3f46'}`,
            borderRadius:4,cursor:'pointer',transition:'all 0.15s',padding:0}}>
          {copied
            ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
            : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#a1a1aa" strokeWidth={2}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
          }
        </button>
      )}
    </div>
  );
}

// ── TABLE STYLES ───────────────────────────────────────────────────────────────
const WBR = '1px solid rgba(255,255,255,0.07)';
const TH: React.CSSProperties  = {background:'#1c1c1e',padding:'8px 10px',textAlign:'center',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.05em',whiteSpace:'nowrap',border:WBR};
const THL: React.CSSProperties = {...TH,textAlign:'left'};
const THC: React.CSSProperties = {...TH,width:40};
const THY: React.CSSProperties = {...TH,color:'#fbbf24'};
const THW: React.CSSProperties = {...TH,color:'#e4e4e7'};
const THSQP:  React.CSSProperties = {...TH,color:'#fbbf24',background:'#1a1f2e'};
const THSQPW: React.CSSProperties = {...TH,color:'#e4e4e7',background:'#1a1f2e',borderLeft:'2px solid #1d4ed8'};
const TD: React.CSSProperties  = {padding:'8px 10px',verticalAlign:'top',textAlign:'center',border:WBR};
const TDL: React.CSSProperties = {...TD,textAlign:'left'};
const TDC: React.CSSProperties = {...TD,verticalAlign:'middle'};
const TDSQP:  React.CSSProperties = {...TD,background:'#1a1f2e'};
const TDSQPF: React.CSSProperties = {...TDSQP,borderLeft:'2px solid #1d4ed8'};

// Fixed width for search term column — ~4 words wide
const TERM_COL_WIDTH = 200;

const Bc = ({children}:{children:React.ReactNode}) =>
  <span style={{fontSize:10,fontWeight:700,background:'#3f3f46',color:'#d4d4d8',borderRadius:4,padding:'2px 7px',whiteSpace:'nowrap'}}>{children}</span>;

const MtTag = ({type}:{type:string}) => {
  const t=type.toLowerCase();
  const s:Record<string,React.CSSProperties>={exact:{background:'#14532d',color:'#4ade80'},phrase:{background:'#713f12',color:'#fbbf24'},broad:{background:'#1e3a5f',color:'#93c5fd'},auto:{background:'#3f1f60',color:'#d8b4fe'}};
  return <span style={{fontSize:9,fontWeight:700,borderRadius:3,padding:'2px 6px',whiteSpace:'nowrap',...(s[t]??{background:'#3f3f46',color:'#d4d4d8'})}}>{t}</span>;
};
const AdTag = ({type}:{type:string}) => {
  const t=type.toUpperCase();
  const s:React.CSSProperties=t==='SP'?{background:'#1e3a5f',color:'#60a5fa'}:{background:'#2d1b4e',color:'#c084fc'};
  return <span style={{fontSize:9,fontWeight:700,borderRadius:3,padding:'1px 5px',whiteSpace:'nowrap',...s}}>{t}</span>;
};

const atStyle=(t:AdType):React.CSSProperties=>t==='sp'?{background:'#1e3a5f',color:'#60a5fa'}:t==='sb'?{background:'#2d1b4e',color:'#c084fc'}:{background:'#3f3f46',color:'#fff'};
const atLabel=(t:AdType)=>t==='sp'?'SP Only':t==='sb'?'SB Only':'SP + SB';
const bmStyle=(t:BrandMode):React.CSSProperties=>t==='branded'?{background:'#1e3a5f',color:'#93c5fd'}:t==='non-branded'?{background:'#14532d',color:'#4ade80'}:{background:'#3f3f46',color:'#fff'};
const bmLabel=(t:BrandMode)=>t==='branded'?'Branded':t==='non-branded'?'Non-Branded':'Both';

const PAGE_SIZE=10;

// ── KPI TABLE HELPERS ──────────────────────────────────────────────────────────
const kpiThs = (withAction=false) => (
  <>
    <th style={THW}>Impressions</th><th style={THW}>Clicks</th>
    <th style={THY}>CTR%</th><th style={THW}>Orders</th><th style={THY}>CVR%</th>
    <th style={THY}>CPC</th><th style={THY}>Spend</th><th style={THY}>Sales</th>
    <th style={THW}>% Spend</th><th style={THW}>% Sales</th>
    <th style={THY}>ACoS%</th><th style={THW}>ROAS</th>
    {withAction && <th style={{...THW,textAlign:'center',minWidth:90}}>Action</th>}
  </>
);

const kpiThsNoAction = () => (
  <>
    <th style={THW}>Impressions</th><th style={THW}>Clicks</th>
    <th style={THY}>CTR%</th><th style={THW}>Orders</th><th style={THY}>CVR%</th>
    <th style={THY}>CPC</th><th style={THY}>Spend</th><th style={THY}>Sales</th>
    <th style={THW}>% Spend</th><th style={THW}>% Sales</th>
    <th style={THY}>ACoS%</th><th style={THW}>ROAS</th>
  </>
);

function kpiTds(r:KpiRow, sz=12, onShowData?:()=>void) {
  return (
    <>
      <td style={TD}><KC main={fmtK(r.impressions)}  wow={r.impDelta}   sz={sz}/></td>
      <td style={TD}><KC main={fmtK(r.clicks)}        wow={r.clkDelta}   sz={sz}/></td>
      <td style={TD}><KC main={fmtPct(r.ctr)}         wow={r.ctrDelta}   yellow isPP sz={sz}/></td>
      <td style={TD}><KC main={String(r.orders)}      wow={r.ordDelta}   sz={sz}/></td>
      <td style={TD}><KC main={fmtPct(r.cvr)}         wow={r.cvrDelta}   yellow isPP sz={sz}/></td>
      <td style={TD}><KC main={fmtCcy(r.cpc)}         wow={r.cpcDelta}   yellow sz={sz}/></td>
      <td style={TD}><KC main={fmtCcy(r.spend)}       wow={r.spendDelta} yellow sz={sz}/></td>
      <td style={TD}><KC main={fmtCcy(r.sales)}       wow={r.salesDelta} yellow sz={sz}/></td>
      <td style={TD}><div style={{textAlign:'center',fontSize:sz,fontWeight:700,color:'#e4e4e7'}}>{r.pctSpend.toFixed(1)}%</div></td>
      <td style={TD}><div style={{textAlign:'center',fontSize:sz,fontWeight:700,color:'#e4e4e7'}}>{r.pctSales.toFixed(1)}%</div></td>
      <td style={TD}><KC main={fmtPct(r.acos)}        wow={r.acosDelta}  yellow inv isPP sz={sz}/></td>
      <td style={TD}><KC main={fmtX(r.roas)}          wow={r.roasDelta}  sz={sz}/></td>
      {onShowData && <td style={{...TD,verticalAlign:'middle'}}><SDB onClick={onShowData}/></td>}
    </>
  );
}

// Total row without pct columns
function totTds(r:KpiRow) {
  return (
    <>
      <td style={{...TD,borderTop:'2px solid rgba(255,255,255,0.18)'}}><KC main={fmtK(r.impressions)} wow={r.impDelta}/></td>
      <td style={{...TD,borderTop:'2px solid rgba(255,255,255,0.18)'}}><KC main={fmtK(r.clicks)}      wow={r.clkDelta}/></td>
      <td style={{...TD,borderTop:'2px solid rgba(255,255,255,0.18)'}}><KC main={fmtPct(r.ctr)}       wow={r.ctrDelta} yellow isPP/></td>
      <td style={{...TD,borderTop:'2px solid rgba(255,255,255,0.18)'}}><KC main={String(r.orders)}    wow={r.ordDelta}/></td>
      <td style={{...TD,borderTop:'2px solid rgba(255,255,255,0.18)'}}><KC main={fmtPct(r.cvr)}       wow={r.cvrDelta} yellow isPP/></td>
      <td style={{...TD,borderTop:'2px solid rgba(255,255,255,0.18)'}}><KC main={fmtCcy(r.cpc)}       wow={r.cpcDelta} yellow/></td>
      <td style={{...TD,borderTop:'2px solid rgba(255,255,255,0.18)'}}><KC main={fmtCcy(r.spend)}     wow={r.spendDelta} yellow/></td>
      <td style={{...TD,borderTop:'2px solid rgba(255,255,255,0.18)'}}><KC main={fmtCcy(r.sales)}     wow={r.salesDelta} yellow/></td>
      <td style={{...TD,borderTop:'2px solid rgba(255,255,255,0.18)',color:'#e4e4e7',fontWeight:800,textAlign:'center'}}>100%</td>
      <td style={{...TD,borderTop:'2px solid rgba(255,255,255,0.18)',color:'#e4e4e7',fontWeight:800,textAlign:'center'}}>100%</td>
      <td style={{...TD,borderTop:'2px solid rgba(255,255,255,0.18)'}}><KC main={fmtPct(r.acos)}      wow={r.acosDelta} yellow inv isPP/></td>
      <td style={{...TD,borderTop:'2px solid rgba(255,255,255,0.18)'}}><KC main={fmtX(r.roas)}        wow={r.roasDelta}/></td>
    </>
  );
}

// Subtotal row
function SubtotalRow({ label, r, indent=28 }: { label:string; r:KpiRow; indent?:number }) {
  return (
    <tr style={{background:BG_TOT}}>
      <td style={{...TDL,paddingLeft:indent,fontSize:10,fontWeight:700,color:'#52525b',borderTop:'1px solid rgba(255,255,255,0.1)'}}>
        {label}
      </td>
      <td style={{...TD,fontSize:10,color:'#52525b',borderTop:'1px solid rgba(255,255,255,0.1)'}}>{fmtK(r.impressions)}</td>
      <td style={{...TD,fontSize:10,color:'#52525b',borderTop:'1px solid rgba(255,255,255,0.1)'}}>{fmtK(r.clicks)}</td>
      <td style={{...TD,fontSize:10,color:'#fbbf24',borderTop:'1px solid rgba(255,255,255,0.1)'}}>{fmtPct(r.ctr)}</td>
      <td style={{...TD,fontSize:10,color:'#52525b',borderTop:'1px solid rgba(255,255,255,0.1)'}}>{r.orders}</td>
      <td style={{...TD,fontSize:10,color:'#fbbf24',borderTop:'1px solid rgba(255,255,255,0.1)'}}>{fmtPct(r.cvr)}</td>
      <td style={{...TD,fontSize:10,color:'#fbbf24',borderTop:'1px solid rgba(255,255,255,0.1)'}}>{fmtCcy(r.cpc)}</td>
      <td style={{...TD,fontSize:10,color:'#fbbf24',borderTop:'1px solid rgba(255,255,255,0.1)'}}>{fmtCcy(r.spend)}</td>
      <td style={{...TD,fontSize:10,color:'#fbbf24',borderTop:'1px solid rgba(255,255,255,0.1)'}}>{fmtCcy(r.sales)}</td>
      <td style={{...TD,fontSize:10,color:'#e4e4e7',borderTop:'1px solid rgba(255,255,255,0.1)'}}>100%</td>
      <td style={{...TD,fontSize:10,color:'#e4e4e7',borderTop:'1px solid rgba(255,255,255,0.1)'}}>100%</td>
      <td style={{...TD,fontSize:10,color:'#fbbf24',borderTop:'1px solid rgba(255,255,255,0.1)'}}>{fmtPct(r.acos)}</td>
      <td style={{...TD,fontSize:10,color:'#52525b',borderTop:'1px solid rgba(255,255,255,0.1)'}}>{fmtX(r.roas)}</td>
    </tr>
  );
}

// ── RESIZABLE/DRAGGABLE SHOW DATA MODAL ──────────────────────────────────────
type ResizeState = { active:boolean; dir:string; startX:number; startY:number; startW:number; startH:number; startL:number; startT:number } | null;

function ShowDataModal({
  open, onClose, config, dateOptions, mode,
  brands, families, adType, sqpOn, topMode,
}: {
  open:boolean; onClose:()=>void; config:ShowDataConfig|null;
  dateOptions:DateOption[]; mode:string;
  brands:string[]; families:string[]; adType:AdType;
  startDate:string; endDate:string;
  sqpOn:boolean; topMode:string;
}) {
  const [sdStart,   setSdStart]   = useState('');
  const [sdEnd,     setSdEnd]     = useState('');
  const [sdData,    setSdData]    = useState<ShowDataRow[]>([]);
  const [sdLoading, setSdLoading] = useState(false);
  const [dims, setDims]           = useState({w:0,h:560,l:0,t:0,ready:false});
  const dimsRef   = useRef(dims);
  const resizingRef = useRef<ResizeState>(null);
  const modalRef  = useRef<HTMLDivElement>(null);
  const minW      = useRef(0);

  useEffect(() => { dimsRef.current = dims; }, [dims]);

  useEffect(() => {
    if (open && typeof window !== 'undefined') {
      const w = Math.round(window.innerWidth * 0.88);
      minW.current = Math.round(window.innerWidth * 0.42);
      setDims({ w, h: 560, l: Math.round((window.innerWidth - w) / 2), t: Math.round((window.innerHeight - 560) / 2), ready: true });
    }
  }, [open]);

  useEffect(() => {
    const applyPos = (l:number,t:number,w:number,h:number) => {
      const el = modalRef.current; if (!el) return;
      el.style.left=`${l}px`; el.style.top=`${t}px`; el.style.width=`${w}px`; el.style.height=`${h}px`;
    };
    const onMove = (e:MouseEvent) => {
      const r = resizingRef.current; if (!r?.active) return;
      const dx=e.clientX-r.startX, dy=e.clientY-r.startY;
      const MIN_W=minW.current, MIN_H=320;
      let {w,h,l,t}={w:r.startW,h:r.startH,l:r.startL,t:r.startT};
      if (r.dir==='drag'){l=r.startL+dx;t=r.startT+dy;}
      else {
        if (r.dir.includes('e')) w=Math.max(MIN_W,r.startW+dx);
        if (r.dir.includes('s')) h=Math.max(MIN_H,r.startH+dy);
        if (r.dir.includes('w')){const nw=Math.max(MIN_W,r.startW-dx);l=r.startL+(r.startW-nw);w=nw;}
        if (r.dir.includes('n')){const nh=Math.max(MIN_H,r.startH-dy);t=r.startT+(r.startH-nh);h=nh;}
      }
      applyPos(l,t,w,h);
    };
    const onUp = () => {
      const r = resizingRef.current; if (!r?.active) return;
      resizingRef.current = {...r,active:false};
      const el = modalRef.current;
      if (el) setDims({w:parseFloat(el.style.width),h:parseFloat(el.style.height),l:parseFloat(el.style.left),t:parseFloat(el.style.top),ready:true});
    };
    document.addEventListener('mousemove',onMove); document.addEventListener('mouseup',onUp);
    return ()=>{ document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onUp); };
  }, []);

  // Default: last 10 date options
  useEffect(() => {
    if (!open || !dateOptions.length) return;
    const latest = dateOptions[0]?.value ?? '';
    const oldest = dateOptions[Math.min(9, dateOptions.length-1)]?.value ?? latest;
    setSdEnd(latest);
    setSdStart(oldest);
  }, [open, dateOptions]);

  const showSqp = sqpOn && topMode === 'keywords' && !!config?.term;

  useEffect(() => {
    if (!open || !sdStart || !sdEnd || !config) return;
    setSdLoading(true);
    fetch('/api/dashboard/search-term-analyzer/show-data', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        mode, startDate: sdStart, endDate: sdEnd,
        brands, families,
        adType: config.adType ?? (adType !== 'both' ? adType.toUpperCase() : undefined),
        matchType:    config.matchType,
        campaignName: config.campaignName,
        term:         config.term,
        includeSqp:   showSqp,
      }),
    }).then(r=>r.json()).then(d=>{ setSdData(d.data??[]); setSdLoading(false); })
      .catch(()=>setSdLoading(false));
  }, [open, sdStart, sdEnd, config]);

  useEffect(() => {
    if (open) return;
    setSdData([]); setSdStart(''); setSdEnd('');
  }, [open]);

  useEffect(() => {
    const h = (e:KeyboardEvent) => { if(e.key==='Escape') onClose(); };
    document.addEventListener('keydown',h); return ()=>document.removeEventListener('keydown',h);
  }, [onClose]);

  if (!open || !config || !dims.ready) return null;

  const E = 6;
  const edge = (extra:React.CSSProperties):React.CSSProperties => ({position:'absolute',zIndex:10,...extra});
  const startResize = (e:React.MouseEvent,dir:string) => {
    e.preventDefault(); e.stopPropagation();
    const el = modalRef.current; if (!el) return;
    resizingRef.current = {active:true,dir,startX:e.clientX,startY:e.clientY,
      startW:parseFloat(el.style.width)||dims.w, startH:parseFloat(el.style.height)||dims.h,
      startL:parseFloat(el.style.left)||dims.l,  startT:parseFloat(el.style.top)||dims.t};
  };
  const startDrag = (e:React.MouseEvent) => {
    e.preventDefault();
    const el = modalRef.current; if (!el) return;
    resizingRef.current = {active:true,dir:'drag',startX:e.clientX,startY:e.clientY,
      startW:parseFloat(el.style.width)||dims.w, startH:parseFloat(el.style.height)||dims.h,
      startL:parseFloat(el.style.left)||dims.l,  startT:parseFloat(el.style.top)||dims.t};
  };

  return (
    <div style={{position:'fixed',inset:0,zIndex:50,pointerEvents:'none'}}>
      <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.75)',pointerEvents:'auto'}} onClick={onClose}/>
      <div ref={modalRef} style={{position:'absolute',background:'#1c1c1e',border:'1px solid #3f3f46',
        borderRadius:14,boxShadow:'0 24px 60px rgba(0,0,0,0.6)',display:'flex',flexDirection:'column',
        overflow:'hidden',pointerEvents:'auto',minWidth:minW.current,minHeight:320,
        width:dims.w,height:dims.h,left:dims.l,top:dims.t}}>

        {/* Resize handles */}
        <div style={edge({top:0,left:E,right:E,height:E,cursor:'n-resize'})}   onMouseDown={e=>startResize(e,'n')}/>
        <div style={edge({bottom:0,left:E,right:E,height:E,cursor:'s-resize'})} onMouseDown={e=>startResize(e,'s')}/>
        <div style={edge({left:0,top:E,bottom:E,width:E,cursor:'w-resize'})}   onMouseDown={e=>startResize(e,'w')}/>
        <div style={edge({right:0,top:E,bottom:E,width:E,cursor:'e-resize'})}  onMouseDown={e=>startResize(e,'e')}/>
        <div style={edge({top:0,left:0,width:E,height:E,cursor:'nw-resize'})}  onMouseDown={e=>startResize(e,'nw')}/>
        <div style={edge({top:0,right:0,width:E,height:E,cursor:'ne-resize'})} onMouseDown={e=>startResize(e,'ne')}/>
        <div style={edge({bottom:0,left:0,width:E,height:E,cursor:'sw-resize'})} onMouseDown={e=>startResize(e,'sw')}/>
        <div style={edge({bottom:0,right:0,width:E,height:E,cursor:'se-resize'})} onMouseDown={e=>startResize(e,'se')}/>

        {/* Draggable header */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 22px',
          borderBottom:'1px solid #3f3f46',background:'#18181b',flexShrink:0,cursor:'move',userSelect:'none'}}
          onMouseDown={startDrag}>
          <div style={{fontSize:14,fontWeight:800,color:'#fff'}}>{config.title} — {mode==='weekly'?'Weekly':'Monthly'} Trend</div>
          <button onClick={onClose} onMouseDown={e=>e.stopPropagation()}
            style={{width:28,height:28,background:'#27272a',border:'1px solid #3f3f46',borderRadius:6,color:'#a1a1aa',cursor:'pointer',fontSize:14,display:'flex',alignItems:'center',justifyContent:'center'}}>✕</button>
        </div>

        {/* Filters */}
        <div style={{display:'flex',alignItems:'flex-end',gap:14,flexWrap:'wrap',padding:'12px 22px',borderBottom:'1px solid #3f3f46',flexShrink:0,background:'#1c1c1e'}}>
          <div style={{display:'flex',flexDirection:'column',gap:4}}>
            <span style={{fontSize:10,fontWeight:700,color:'#71717a',textTransform:'uppercase',letterSpacing:'0.06em'}}>{mode==='weekly'?'Start Week':'Start Month'}</span>
            <select value={sdStart} onChange={e=>setSdStart(e.target.value)}
              style={{background:'#27272a',border:'1px solid #3f3f46',borderRadius:7,color:'#e4e4e7',fontSize:12,fontWeight:600,padding:'7px 12px',minWidth:220,outline:'none'}}>
              {dateOptions.map(d=><option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:4}}>
            <span style={{fontSize:10,fontWeight:700,color:'#71717a',textTransform:'uppercase',letterSpacing:'0.06em'}}>{mode==='weekly'?'End Week':'End Month'}</span>
            <select value={sdEnd} onChange={e=>setSdEnd(e.target.value)}
              style={{background:'#27272a',border:'1px solid #3f3f46',borderRadius:7,color:'#e4e4e7',fontSize:12,fontWeight:600,padding:'7px 12px',minWidth:220,outline:'none'}}>
              {dateOptions.map(d=><option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
          <div style={{fontSize:11,color:'#71717a',alignSelf:'flex-end',paddingBottom:2}}>
            {sdData.length} {mode==='weekly'?'weeks':'months'} · latest first · WoW vs previous period
          </div>
        </div>

        {/* Table */}
        <div style={{flex:1,overflow:'auto'}}>
          <div style={{minWidth:'max-content'}}>
            {sdLoading ? (
              <div style={{display:'flex',alignItems:'center',justifyContent:'center',padding:40,gap:12}}>
                <div style={{width:16,height:16,border:'2px solid #f97316',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
                <span style={{fontSize:12,color:'#71717a'}}>Loading...</span>
              </div>
            ) : !sdData.length ? (
              <div style={{textAlign:'center',padding:40,fontSize:12,color:'#52525b'}}>No data found</div>
            ) : (
              <table style={{borderCollapse:'collapse',width:'100%',fontSize:11}}>
                <thead>
                  <tr>
                    <th style={{...THL,minWidth:220,color:'#e4e4e7',position:'sticky',top:0}}>{mode==='weekly'?'Week':'Month'}</th>
                    {showSqp&&<th style={{...THSQPW,position:'sticky',top:0,borderLeft:'2px solid #1d4ed8'}}>Search Vol</th>}
                    <th style={{...THW,position:'sticky',top:0}}>Impressions</th>
                    <th style={{...THW,position:'sticky',top:0}}>Clicks</th>
                    <th style={{...THY,position:'sticky',top:0}}>CTR%</th>
                    <th style={{...THW,position:'sticky',top:0}}>Orders</th>
                    <th style={{...THY,position:'sticky',top:0}}>CVR%</th>
                    <th style={{...THY,position:'sticky',top:0}}>CPC</th>
                    <th style={{...THY,position:'sticky',top:0}}>Spend</th>
                    <th style={{...THY,position:'sticky',top:0}}>Sales</th>
                    <th style={{...THY,position:'sticky',top:0}}>ACoS%</th>
                    <th style={{...THW,position:'sticky',top:0}}>ROAS</th>
                    {showSqp&&<><th style={{...THSQP,position:'sticky',top:0}}>Impr. Share</th><th style={{...THSQP,position:'sticky',top:0}}>Click Share</th><th style={{...THSQP,position:'sticky',top:0}}>Cart Share</th><th style={{...THSQP,position:'sticky',top:0}}>Purch. Share</th><th style={{...THSQP,position:'sticky',top:0}}>Rev. Share</th></>}
                  </tr>
                </thead>
                <tbody>
                  {sdData.map((row,i) => (
                    <tr key={row.dateKey} style={{background:i%2===0?'#27272a':'#242426'}}>
                      <td style={{...TDL}}>
                        <div style={{fontSize:12,fontWeight:700,color:'#fff'}}>{row.label}</div>
                      </td>
                      {showSqp&&(
                        <td style={TDSQPF}>
                          {row.searchVolume!=null?<KC main={fmtK(row.searchVolume)} wow={row.searchVolumeDelta??null}/>:<div style={{fontSize:10,color:'#52525b',textAlign:'center'}}>—</div>}
                        </td>
                      )}
                      <td style={TD}><KC main={fmtK(row.impressions)} wow={row.impDelta}/></td>
                      <td style={TD}><KC main={fmtK(row.clicks)}      wow={row.clkDelta}/></td>
                      <td style={TD}><KC main={fmtPct(row.ctr)}       wow={row.ctrDelta} yellow isPP/></td>
                      <td style={TD}><KC main={String(row.orders)}    wow={row.ordDelta}/></td>
                      <td style={TD}><KC main={fmtPct(row.cvr)}       wow={row.cvrDelta} yellow isPP/></td>
                      <td style={TD}><KC main={fmtCcy(row.cpc)}       wow={row.cpcDelta} yellow/></td>
                      <td style={TD}><KC main={fmtCcy(row.spend)}     wow={row.spendDelta} yellow/></td>
                      <td style={TD}><KC main={fmtCcy(row.sales)}     wow={row.salesDelta} yellow/></td>
                      <td style={TD}><KC main={fmtPct(row.acos)}      wow={row.acosDelta} yellow inv isPP/></td>
                      <td style={TD}><KC main={fmtX(row.roas)}        wow={row.roasDelta}/></td>
                      {showSqp&&(
                        <>
                          <td style={TDSQP}>{row.impressionShare!=null?<KC main={`${row.impressionShare.toFixed(1)}%`} wow={row.impressionShareDelta??null} isPP/>:<div style={{fontSize:10,color:'#52525b',textAlign:'center'}}>—</div>}</td>
                          <td style={TDSQP}>{row.clickShare!=null?<KC main={`${row.clickShare.toFixed(1)}%`} wow={row.clickShareDelta??null} isPP/>:<div style={{fontSize:10,color:'#52525b',textAlign:'center'}}>—</div>}</td>
                          <td style={TDSQP}>{row.cartShare!=null?<KC main={`${row.cartShare.toFixed(1)}%`} wow={row.cartShareDelta??null} isPP/>:<div style={{fontSize:10,color:'#52525b',textAlign:'center'}}>—</div>}</td>
                          <td style={TDSQP}>{row.purchaseShare!=null?<KC main={`${row.purchaseShare.toFixed(1)}%`} wow={row.purchaseShareDelta??null} isPP/>:<div style={{fontSize:10,color:'#52525b',textAlign:'center'}}>—</div>}</td>
                          <td style={TDSQP}>{row.revenueShare!=null?<KC main={`${row.revenueShare.toFixed(1)}%`} wow={row.revenueShareDelta??null} isPP/>:<div style={{fontSize:10,color:'#52525b',textAlign:'center'}}>—</div>}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ── PAGE ────────────────────────────────────────────────────────────────────────
export default function SearchTermAnalyzerPage() {
  const [mode, setMode]              = useState<'weekly'|'monthly'>('weekly');
  const [allBrands, setAllBrands]    = useState<string[]>([]);
  const [allFamilies, setAllFamilies]= useState<string[]>([]);
  const [weekDates, setWeekDates]    = useState<DateOption[]>([]);
  const [monthDates, setMonthDates]  = useState<DateOption[]>([]);
  const [selBrand, setSelBrand]      = useState('');
  const [selFamily, setSelFamily]    = useState('');
  const [startDate, setStartDate]    = useState('');
  const [endDate, setEndDate]        = useState('');

  // Global toggles (affect all sections)
  const [adType,    setAdType]    = useState<AdType>('both');
  const [brandMode, setBrandMode] = useState<BrandMode>('both');

  // Section 0 controls
  const [topMode,    setTopMode]    = useState<TopMode>('keywords');
  const [analyzeBy,  setAnalyzeBy]  = useState<AnalyzeBy>('search_term');
  const [sortKpi,    setSortKpi]    = useState<SortKpi>('spend');
  const [sortDir,    setSortDir]    = useState<SortDir>('desc');
  const [filterType, setFilterType] = useState<FilterType>('none');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo,   setFilterTo]   = useState('');
  const [activeFilter, setActiveFilter] = useState<{type:FilterType;from:string;to:string;kpi:SortKpi}|null>(null);
  const [sqpOn,  setSqpOn]  = useState(false);
  const [page,   setPage]   = useState(1);
  const [s1Open, setS1Open] = useState(false);

  // Data
  const [rows,       setRows]      = useState<STARow[]>([]);
  const [loading,    setLoading]   = useState(false);
  const [selectedTerm, setSelectedTerm] = useState<string|null>(null);
  const [sqpMap,     setSqpMap]    = useState<Record<string,SqpData>>({});
  const [sqpLoading, setSqpLoading]= useState(false);

  // MTA 1.0
  const [mto1Open,   setMto1Open]   = useState(true);
  const [mto1Data,   setMto1Data]   = useState<Mto1AdType[]|null>(null);
  const [mto1Total,  setMto1Total]  = useState<KpiRow|null>(null);
  const [mto1Loading,setMto1Loading]= useState(false);
  const [mto1ExpandedAt, setMto1ExpandedAt] = useState<Set<string>>(new Set());

  // Family Distribution
  const [familyData,    setFamilyData]    = useState<FamilyRow[]|null>(null);
  const [familyTotal,   setFamilyTotal]   = useState<KpiRow|null>(null);
  const [familyLoading, setFamilyLoading] = useState(false);
  const [expandedFam, setExpandedFam] = useState<Set<string>>(new Set());
  const [expandedAt,  setExpandedAt]  = useState<Set<string>>(new Set());
  const [expandedMtF, setExpandedMtF] = useState<Set<string>>(new Set());

  // MTA 2.0
  const [mtData,    setMtData]    = useState<MTRow[]|null>(null);
  const [mtTotal,   setMtTotal]   = useState<KpiRow|null>(null);
  const [mtLoading, setMtLoading] = useState(false);
  const [expandedMt,setExpandedMt]= useState<Set<string>>(new Set());

  // Show Data modal
  const [sdOpen,   setSdOpen]   = useState(false);
  const [sdConfig, setSdConfig] = useState<ShowDataConfig|null>(null);

  const dateOptions = mode==='weekly' ? weekDates : monthDates;

  const openShowData = (config: ShowDataConfig) => { setSdConfig(config); setSdOpen(true); };

  // Guard: skip brand-change effect during initial default load
  const initDoneRef = useRef(false);

  // ── On mount ─────────────────────────────────────────────────────────────────
  const loadDefaults = useCallback(async (m:'weekly'|'monthly') => {
    const r = await fetch(`/api/dashboard/search-term-analyzer?mode=${m}`);
    const d = await r.json();
    if (d.dateOptions?.length) {
      if (m==='weekly') setWeekDates(d.dateOptions); else setMonthDates(d.dateOptions);
    }
    // Set date range to latest single period
    if (d.latestDate) { 
      setStartDate(d.latestDate); 
      setEndDate(d.latestDate); 
    }

    // Set brands list
    if (d.allBrands?.length) setAllBrands(d.allBrands);

    // ✅ FIX 1: Auto-select top brand by spend
    if (d.topBrand) setSelBrand(d.topBrand);

    // ✅ FIX 2: Set families ONLY for the selected brand + auto-select top family by spend
    if (d.familiesForBrand?.length) setAllFamilies(d.familiesForBrand);
    if (d.topFamily) setSelFamily(d.topFamily);
       initDoneRef.current = true;
  }, []);

  useEffect(() => { loadDefaults('weekly'); }, [loadDefaults]);

  // When mode changes: update date range; load dates for this mode if not yet loaded
  useEffect(() => {
    const dates = mode === 'weekly' ? weekDates : monthDates;
    if (dates.length === 0) {
      loadDefaults(mode);
    } else {
      // Reset to latest single period for this mode
      setStartDate(dates[0]?.value ?? '');
      setEndDate(dates[0]?.value ?? '');
    }
    // Clear stale results from previous mode
    setRows([]); setSelectedTerm(null); setMto1Data(null); setFamilyData(null); setMtData(null); setSqpMap({});
  }, [mode, weekDates, monthDates, loadDefaults]);

  // When user manually changes brand — fetch families from ad data (consistent source)
  useEffect(() => {
    if (!selBrand || !initDoneRef.current) return;
    fetch(`/api/dashboard/search-term-analyzer?mode=${mode}&brand=${encodeURIComponent(selBrand)}`)
      .then(r=>r.json())
      .then(d=>{
        // Update families to show ONLY families belonging to this brand
        if (d.familiesForBrand) setAllFamilies(d.familiesForBrand);

        // Auto-select top family by spend within this brand
        if (d.topFamily) setSelFamily(d.topFamily);
        else setSelFamily(''); // Clear if no families found
      });
  }, [selBrand, mode]);

  // ── Fetch MTA 1.0 ────────────────────────────────────────────────────────────
  const fetchMto1 = useCallback(async () => {
    if (!selBrand&&!selFamily) return;
    if (!startDate||!endDate) return;
    setMto1Loading(true); setMto1Data(null);
    try {
      const res = await fetch('/api/dashboard/search-term-analyzer/match-type-overview', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ brands:selBrand?[selBrand]:[], families:selFamily?[selFamily]:[], startDate, endDate, mode, adType }),
      });
      const j = await res.json();
      setMto1Data(j.data??[]); setMto1Total(j.total??null);
      setMto1ExpandedAt(new Set());
    } finally { setMto1Loading(false); }
  }, [selBrand, selFamily, startDate, endDate, mode, adType]);

  // ── Fetch search term rows ────────────────────────────────────────────────────
  const fetchRows = useCallback(async () => {
    if (!selBrand&&!selFamily) return;
    if (!startDate||!endDate) return;
    setLoading(true); setSelectedTerm(null); setFamilyData(null); setMtData(null); setSqpMap({});
    try {
      const res = await fetch('/api/dashboard/search-term-analyzer', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ brands:selBrand?[selBrand]:[], families:selFamily?[selFamily]:[], startDate, endDate, mode, analyzeMode:topMode, analyzeBy, adType, brandMode }),
      });
      const j = await res.json();
      setRows(j.data??[]); setPage(1);
    } finally { setLoading(false); }
  }, [selBrand, selFamily, startDate, endDate, mode, topMode, analyzeBy, adType, brandMode]);

  const handleApply = useCallback(() => { fetchMto1(); fetchRows(); }, [fetchMto1, fetchRows]);
  useEffect(() => { if (mto1Data!==null) fetchMto1(); }, [adType]);
  useEffect(() => { if (rows.length>0) fetchRows(); }, [topMode, analyzeBy, adType, brandMode]);

  // ── SQP batch fetch ───────────────────────────────────────────────────────────
  const fetchSqpBatch = useCallback(async (terms:string[]) => {
    if (!terms.length||topMode==='asins') return;
    setSqpLoading(true);
    try {
      const missing = terms.filter(t=>!(t in sqpMap));
      if (!missing.length) { setSqpLoading(false); return; }
      const results = await Promise.all(missing.map(term =>
        fetch('/api/dashboard/search-term-analyzer/sqp', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ term, brands:selBrand?[selBrand]:[], families:selFamily?[selFamily]:[], startDate, endDate, mode }),
        }).then(r=>r.json()).then(d=>({term, data:d.data??null}))
      ));
      setSqpMap(prev=>{const n={...prev};for(const{term,data}of results)n[term]=data;return n;});
    } finally { setSqpLoading(false); }
  }, [sqpMap, selBrand, selFamily, startDate, endDate, mode, topMode]);

  // ── Family + MTA 2.0 ──────────────────────────────────────────────────────────
  const fetchFamily = useCallback(async (term:string) => {
    setFamilyLoading(true); setFamilyData(null);
    try {
      const res = await fetch('/api/dashboard/search-term-analyzer/family', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ term, startDate, endDate, mode, adType }),
      });
      const j = await res.json();
      setFamilyData(j.data??[]); setFamilyTotal(j.total??null);
    } finally { setFamilyLoading(false); }
  }, [startDate, endDate, mode, adType]);

  const fetchMt = useCallback(async (term:string) => {
    setMtLoading(true); setMtData(null);
    try {
      const res = await fetch('/api/dashboard/search-term-analyzer/match-type', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ term, brands:selBrand?[selBrand]:[], families:selFamily?[selFamily]:[], startDate, endDate, mode, adType }),
      });
      const j = await res.json();
      setMtData(j.data??[]); setMtTotal(j.total??null); setExpandedMt(new Set());
    } finally { setMtLoading(false); }
  }, [selBrand, selFamily, startDate, endDate, mode, adType]);

  function handleSelectRow(term:string) {
    setSelectedTerm(term); fetchFamily(term); fetchMt(term);
    if (sqpOn&&topMode==='keywords') fetchSqpBatch([term]);
  }

  useEffect(() => {
    if (sqpOn&&topMode==='keywords'&&pagedRows.length>0) fetchSqpBatch(pagedRows.map(r=>r.term));
  }, [sqpOn, page]);

  // ── Filter + sort ─────────────────────────────────────────────────────────────
  const processedRows = React.useMemo(() => {
    let r=[...rows];
    if (activeFilter&&activeFilter.type!=='none') {
      const from=parseFloat(activeFilter.from),to=parseFloat(activeFilter.to);
      r=r.filter(row=>{
        const v=getKV(row,activeFilter.kpi);
        if(activeFilter.type==='between')return v>=from&&v<=to;
        if(activeFilter.type==='gt')return v>from;
        if(activeFilter.type==='lt')return v<from;
        if(activeFilter.type==='eq')return Math.abs(v-from)<0.001;
        return true;
      });
    }
    r.sort((a,b)=>{const av=getKV(a,sortKpi),bv=getKV(b,sortKpi);return sortDir==='desc'?bv-av:av-bv;});
    return r;
  }, [rows, activeFilter, sortKpi, sortDir]);

  const totalPages=Math.ceil(processedRows.length/PAGE_SIZE);
  const pagedRows=processedRows.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE);

  const filterBadge=()=>{
    if(!activeFilter||activeFilter.type==='none')return 'no filter';
    const l=SORT_KPI_LABELS[activeFilter.kpi],pfx=CCY_KPIS.has(activeFilter.kpi)?'$':'',sfx=PCT_KPIS.has(activeFilter.kpi)?'%':'';
    const f=`${pfx}${activeFilter.from}${sfx}`,t=`${pfx}${activeFilter.to}${sfx}`;
    if(activeFilter.type==='between')return `${l} between ${f} – ${t}`;
    if(activeFilter.type==='gt')return `${l} > ${f}`;
    if(activeFilter.type==='lt')return `${l} < ${f}`;
    if(activeFilter.type==='eq')return `${l} = ${f}`;
    return '';
  };

  const togSet=(set:Set<string>,setFn:React.Dispatch<React.SetStateAction<Set<string>>>,key:string)=>
    setFn(prev=>{const n=new Set(prev);n.has(key)?n.delete(key):n.add(key);return n;});

  // ── RENDER ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-zinc-900 text-white">
      {/* Header */}
      <div className="border-b border-zinc-700 px-8 py-5">
        <h1 className="text-xl font-bold">Match Type Analysis</h1>
        <p className="text-sm text-zinc-400 mt-1">Ads performance · Match type breakdown · 100% ads data</p>
      </div>

      {/* WoW / MoM tabs */}
      <div className="border-b border-zinc-700 px-8">
        <div className="flex">
          {(['weekly','monthly'] as const).map(m=>(
            <button key={m} onClick={()=>{ if(m!==mode) setMode(m); }}
              className={`py-4 px-6 text-sm font-semibold border-b-2 transition-colors ${mode===m?'border-orange-400 text-orange-400':'border-transparent text-zinc-400 hover:text-white'}`}>
              {m==='weekly'?'Week over Week':'Month over Month'}
            </button>
          ))}
        </div>
      </div>

      <div className="px-8 py-6 space-y-4">

        {/* ── FILTER BAR (with Ad Type + Branded toggles) ── */}
        <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4">
          <div className="flex flex-wrap gap-4 items-end">
            {/* Date filters */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-wide">{mode==='weekly'?'Start Week':'Start Month'}</label>
              <select value={startDate} onChange={e=>setStartDate(e.target.value)}
                className="bg-zinc-700 border border-zinc-600 rounded px-3 py-2 text-sm text-white min-w-[240px] outline-none">
                {dateOptions.map(d=><option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-wide">{mode==='weekly'?'End Week':'End Month'}</label>
              <select value={endDate} onChange={e=>setEndDate(e.target.value)}
                className="bg-zinc-700 border border-zinc-600 rounded px-3 py-2 text-sm text-white min-w-[240px] outline-none">
                {dateOptions.map(d=><option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-wide">Brand</label>
              <select value={selBrand} onChange={e=>{setSelBrand(e.target.value);setSelFamily('');}}
                className="bg-zinc-700 border border-zinc-600 rounded px-3 py-2 text-sm text-white min-w-[140px] outline-none">
                {allBrands.map(b=><option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-wide">Family</label>
              <select value={selFamily} onChange={e=>setSelFamily(e.target.value)}
                className="bg-zinc-700 border border-zinc-600 rounded px-3 py-2 text-sm text-white min-w-[140px] outline-none">
                <option value="">All Families</option>
                {allFamilies.map(f=><option key={f} value={f}>{f}</option>)}
              </select>
            </div>

            {/* Divider */}
            <div className="w-px bg-zinc-700 self-stretch mx-1"/>

            {/* Ad Type — global */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-wide">Ad Type</label>
              <div className="flex bg-zinc-900 border border-zinc-700 rounded-lg overflow-hidden">
                {(['sp','both','sb'] as AdType[]).map(t=>(
                  <button key={t} onClick={()=>setAdType(t)} style={adType===t?atStyle(t):{}}
                    className={`px-3 py-1.5 text-xs font-bold border-r border-zinc-700 last:border-0 ${adType!==t?'text-zinc-500 hover:text-white':''}`}>
                    {atLabel(t)}
                  </button>
                ))}
              </div>
            </div>

            {/* Branded — global, keywords only */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-wide">Keyword Type</label>
              <div className="flex bg-zinc-900 border border-zinc-700 rounded-lg overflow-hidden">
                {(['non-branded','both','branded'] as BrandMode[]).map(t=>(
                  <button key={t} onClick={()=>setBrandMode(t)} style={brandMode===t?bmStyle(t):{}}
                    className={`px-3 py-1.5 text-xs font-bold border-r border-zinc-700 last:border-0 ${brandMode!==t?'text-zinc-500 hover:text-white':''}`}>
                    {bmLabel(t)}
                  </button>
                ))}
              </div>
            </div>

            <button onClick={handleApply} disabled={loading||mto1Loading}
              className="px-4 py-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white rounded text-sm font-bold self-end">
              {loading||mto1Loading?'Loading...':'Apply'}
            </button>
          </div>
        </div>

        {/* ══ MTA 1.0 ══ */}
        <div className="bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-700 flex-wrap gap-3">
            <div className="cursor-pointer" onClick={()=>setMto1Open(o=>!o)}>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <svg className={`w-4 h-4 text-zinc-500 transition-transform ${mto1Open?'rotate-90':''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7"/></svg>
                Match Type Analysis 1.0
                <span style={{fontSize:10,fontWeight:700,background:'#f97316',color:'#fff',borderRadius:4,padding:'2px 7px'}}>Overview</span>
                <span style={{fontSize:10,fontWeight:700,borderRadius:4,padding:'2px 8px',...atStyle(adType)}}>{atLabel(adType)}</span>
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">Ad Type → Match Type · all filters applied · sorted by spend ↓</p>
            </div>
          </div>

          {mto1Open && (
            mto1Loading ? <div className="flex items-center justify-center py-10 gap-3"><div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"/><span className="text-xs text-zinc-400">Loading...</span></div>
            : !mto1Data?.length ? <div className="flex items-center justify-center py-10"><p className="text-xs text-zinc-500">Apply filters above to load data</p></div>
            : (
              <div style={{overflowX:'auto'}}>
                <table style={{borderCollapse:'collapse',width:'100%',fontSize:11}}>
                  <thead><tr><th style={{...THL,minWidth:260,color:'#e4e4e7'}}>Ad Type / Match Type</th>{kpiThs(true)}</tr></thead>
                  <tbody>
                    {mto1Data.map(at=>{
                      const aOpen=mto1ExpandedAt.has(at.adType);
                      return (
                        <React.Fragment key={at.adType}>
                          <tr style={{background:BG_L1,cursor:'pointer',borderLeft:LB_L1}}
                            onClick={()=>togSet(mto1ExpandedAt,setMto1ExpandedAt,at.adType)}
                            onMouseEnter={e=>(e.currentTarget.style.background=BG_L1H)}
                            onMouseLeave={e=>(e.currentTarget.style.background=BG_L1)}>
                            <td style={{...TDL,borderLeft:LB_L1}}><div style={{display:'flex',alignItems:'center',gap:7}}>
                              <span style={{fontSize:10,color:'#71717a',display:'inline-block',transform:aOpen?'rotate(90deg)':'none',transition:'transform 0.15s'}}>▶</span>
                              <AdTag type={at.adType}/><span style={{fontSize:12,fontWeight:700,color:'#fff'}}>{at.adType==='SP'?'Sponsored Products':'Sponsored Brands'}</span>
                            </div></td>
                            {kpiTds(at, 12, ()=>openShowData({ title:`${at.adType} — All Match Types`, adType:at.adType }))}
                          </tr>
                          {aOpen && at.matchTypes.map(mt=>(
                            <tr key={mt.matchType} style={{background:BG_L2}}
                              onMouseEnter={e=>(e.currentTarget.style.background=BG_L2H)}
                              onMouseLeave={e=>(e.currentTarget.style.background=BG_L2)}>
                              <td style={{...TDL,paddingLeft:28,borderLeft:LB_L2}}><div style={{display:'flex',alignItems:'center',gap:7}}>
                                <div style={{width:2,height:14,background:'#3f3f46',borderRadius:2,flexShrink:0}}/>
                                <MtTag type={mt.matchType}/><span style={{fontSize:11,fontWeight:600,color:'#d4d4d8'}}>{mt.matchType.charAt(0).toUpperCase()+mt.matchType.slice(1)} Match</span>
                              </div></td>
                              {kpiTds(mt, 11, ()=>openShowData({ title:`${at.adType} — ${mt.matchType}`, adType:at.adType, matchType:mt.matchType }))}
                            </tr>
                          ))}
                          {aOpen && <SubtotalRow label={`Subtotal · ${at.matchTypes.length} match type${at.matchTypes.length!==1?'s':''}`} r={at} indent={28}/>}
                        </React.Fragment>
                      );
                    })}
                    {mto1Total && (
                      <tr style={{background:BG_TOT}}>
                        <td style={{...TDL,color:'#f97316',fontWeight:800,borderTop:'2px solid rgba(255,255,255,0.18)'}}>Total · {mto1Data.length} ad type{mto1Data.length!==1?'s':''}</td>
                        {totTds(mto1Total)}
                        <td style={{...TD,borderTop:'2px solid rgba(255,255,255,0.18)',verticalAlign:'middle'}}>
                          <SDB onClick={()=>openShowData({title:'All Ad Types — Overview'})}/>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>

        {/* ── ANALYZE TOGGLE ── */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-bold text-zinc-400 uppercase tracking-wide">Analyze:</span>
          <div className="flex bg-zinc-800 border border-zinc-700 rounded-lg overflow-hidden">
            <button onClick={()=>{setTopMode('keywords');setAnalyzeBy('search_term');}}
              className={`px-5 py-2 text-sm font-bold transition-colors ${topMode==='keywords'?'bg-orange-500 text-white':'text-zinc-400 hover:text-white'}`}>Keywords</button>
            <button onClick={()=>{setTopMode('asins');setAnalyzeBy('search_term');setSqpOn(false);}}
              className={`px-5 py-2 text-sm font-bold border-l border-zinc-700 transition-colors ${topMode==='asins'?'bg-orange-500 text-white':'text-zinc-400 hover:text-white'}`}>ASINs</button>
          </div>
          <div className="flex bg-zinc-800 border border-zinc-700 rounded-lg overflow-hidden">
            {topMode==='keywords'?(
              <>
                <button onClick={()=>setAnalyzeBy('search_term')} className={`px-4 py-2 text-xs font-bold transition-colors ${analyzeBy==='search_term'?'bg-zinc-600 text-white':'text-zinc-400 hover:text-white'}`}>By Search Term</button>
                <button onClick={()=>setAnalyzeBy('keyword')} className={`px-4 py-2 text-xs font-bold border-l border-zinc-700 transition-colors ${analyzeBy==='keyword'?'bg-zinc-600 text-white':'text-zinc-400 hover:text-white'}`}>By Keyword</button>
              </>
            ):(
              <>
                <button onClick={()=>setAnalyzeBy('search_term')} className={`px-4 py-2 text-xs font-bold transition-colors ${analyzeBy==='search_term'?'bg-zinc-600 text-white':'text-zinc-400 hover:text-white'}`}>By Search Term</button>
                <button onClick={()=>setAnalyzeBy('targeting')} className={`px-4 py-2 text-xs font-bold border-l border-zinc-700 transition-colors ${analyzeBy==='targeting'?'bg-zinc-600 text-white':'text-zinc-400 hover:text-white'}`}>By Targets</button>
              </>
            )}
          </div>
        </div>

        {/* ══ SECTION 0: Search Terms ══ */}
        <div className="bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-700 flex-wrap gap-3">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                {topMode==='keywords'?(analyzeBy==='keyword'?'Keywords':'Search Terms'):(analyzeBy==='targeting'?'Target ASINs':'ASIN Search Terms')}
                <Bc>{processedRows.length} {topMode==='keywords'?'terms':'ASINs'}</Bc>
                <span style={{fontSize:10,fontWeight:700,borderRadius:4,padding:'2px 8px',...atStyle(adType)}}>{atLabel(adType)}</span>
                {topMode==='keywords'&&<span style={{fontSize:10,fontWeight:700,borderRadius:4,padding:'2px 8px',...bmStyle(brandMode)}}>{bmLabel(brandMode)}</span>}
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">Click a row to load analysis below</p>
            </div>
            {topMode==='keywords'&&(
              <button onClick={()=>{const n=!sqpOn;setSqpOn(n);if(n)fetchSqpBatch(pagedRows.map(r=>r.term));}}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border rounded-lg ${sqpOn?'bg-blue-950 border-blue-800 text-blue-300':'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white'}`}>
                <div style={{width:7,height:7,borderRadius:'50%',background:sqpOn?'#93c5fd':'#3f3f46'}}/>
                {sqpOn?(sqpLoading?'Loading SQP...':'Hide SQP'):'Show SQP'}
              </button>
            )}
          </div>

          {/* Sort + filter */}
          <div className="flex items-end gap-3 px-5 py-3 border-b border-zinc-700 bg-zinc-900/40 flex-wrap">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Sort By</span>
              <select value={sortKpi} onChange={e=>setSortKpi(e.target.value as SortKpi)} className="bg-zinc-700 border border-zinc-600 rounded px-2 py-1.5 text-xs text-white outline-none">
                {Object.entries(SORT_KPI_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Direction</span>
              <select value={sortDir} onChange={e=>setSortDir(e.target.value as SortDir)} className="bg-zinc-700 border border-zinc-600 rounded px-2 py-1.5 text-xs text-white outline-none">
                <option value="desc">High → Low</option><option value="asc">Low → High</option>
              </select>
            </div>
            <div className="w-px bg-zinc-700 self-stretch mx-1"/>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Filter</span>
              <div className="flex gap-1.5">
                {(['none','eq','gt','lt','between'] as FilterType[]).map(t=>{
                  const L:Record<FilterType,string>={none:'None',eq:'Equal To',gt:'Greater Than',lt:'Lower Than',between:'Between'};
                  return <button key={t} onClick={()=>{setFilterType(t);setFilterFrom('');setFilterTo('');}}
                    className={`px-2.5 py-1.5 text-xs font-bold border rounded ${filterType===t?'bg-zinc-600 border-zinc-500 text-white':'bg-zinc-800 border-zinc-700 text-zinc-500 hover:text-zinc-200'}`}>{L[t]}</button>;
                })}
              </div>
            </div>
            {filterType!=='none'&&(
              <>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-zinc-500 uppercase tracking-wide">
                    {filterType==='between'?`Range — ${SORT_KPI_LABELS[sortKpi]}`:`${filterType==='eq'?'Equal To':filterType==='gt'?'Greater Than':'Lower Than'} — ${SORT_KPI_LABELS[sortKpi]}`}
                    {PCT_KPIS.has(sortKpi)?' (%)':CCY_KPIS.has(sortKpi)?' ($)':''}
                  </span>
                  <div className="flex items-center gap-2">
                    <input type="text" value={filterFrom} onChange={e=>setFilterFrom(e.target.value)}
                      placeholder={PCT_KPIS.has(sortKpi)?'e.g. 2.5':CCY_KPIS.has(sortKpi)?'e.g. 500':'e.g. 10'}
                      className="bg-zinc-700 border border-zinc-600 rounded px-2 py-1.5 text-xs text-white outline-none w-24 focus:border-orange-400"/>
                    {filterType==='between'&&(<><span className="text-zinc-500 text-xs">–</span>
                      <input type="text" value={filterTo} onChange={e=>setFilterTo(e.target.value)}
                        placeholder={PCT_KPIS.has(sortKpi)?'e.g. 5.0':CCY_KPIS.has(sortKpi)?'e.g. 4000':'e.g. 200'}
                        className="bg-zinc-700 border border-zinc-600 rounded px-2 py-1.5 text-xs text-white outline-none w-24 focus:border-orange-400"/></>)}
                  </div>
                </div>
                <button onClick={()=>{if(filterFrom)setActiveFilter({type:filterType,from:filterFrom,to:filterTo,kpi:sortKpi});}} disabled={!filterFrom}
                  className="px-3 py-1.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white text-xs font-bold rounded self-end">Apply Filter</button>
              </>
            )}
            {activeFilter&&activeFilter.type!=='none'&&(
              <div className="flex items-center gap-2 bg-amber-950/40 border border-amber-800/50 rounded-lg px-3 py-1.5 self-end">
                <span className="text-xs font-semibold text-amber-300">{filterBadge()}</span>
                <button onClick={()=>{setActiveFilter(null);setFilterType('none');setFilterFrom('');setFilterTo('');}} className="text-zinc-500 hover:text-white text-sm">✕</button>
              </div>
            )}
          </div>

          {/* Table */}
          <div style={{overflowX:'auto'}}>
            {rows.length===0&&!loading?(
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <div className="w-14 h-14 rounded-full bg-zinc-700 flex items-center justify-center">
                  <svg className="w-7 h-7 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                </div>
                <p className="text-sm font-bold text-zinc-300">Select filters and click Apply</p>
              </div>
            ):loading?(
              <div className="flex items-center justify-center py-16 gap-3">
                <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"/>
                <span className="text-sm text-zinc-400">Loading...</span>
              </div>
            ):(
              <table style={{borderCollapse:'collapse',width:'100%',fontSize:11}}>
                <thead><tr>
                  <th style={THC}>✓</th>
                  {/* Fixed-width search term column */}
                  <th style={{...THL,width:TERM_COL_WIDTH,minWidth:TERM_COL_WIDTH,maxWidth:TERM_COL_WIDTH,color:'#e4e4e7'}}>
                    {topMode==='keywords'?(analyzeBy==='keyword'?'Keyword':'Search Term'):'ASIN'}
                  </th>
                  {sqpOn&&topMode==='keywords'&&<th style={{...THSQPW,minWidth:90}}>Search Vol</th>}
                  <th style={THW}>Impressions</th><th style={THW}>Clicks</th>
                  <th style={THY}>CTR%</th><th style={THW}>Orders</th><th style={THY}>CVR%</th>
                  <th style={THY}>CPC</th><th style={THY}>Spend</th><th style={THY}>Sales</th>
                  <th style={THY}>ACoS%</th><th style={THW}>ROAS</th>
                  {sqpOn&&topMode==='keywords'&&(<><th style={THSQP}>Impr. Share</th><th style={THSQP}>Click Share</th><th style={THSQP}>Cart Share</th><th style={THSQP}>Purch. Share</th><th style={THSQP}>Rev. Share</th></>)}
                  <th style={{...TH,minWidth:80}}>Trend</th>
                </tr></thead>
                <tbody>
                  {pagedRows.map((row,i)=>{
                    const isSel=selectedTerm===row.term;
                    const sqp=sqpMap[row.term]??null;
                    const bg=isSel?'#1a2e1a':i%2===0?'#27272a':'#242426';
                    return (
                      <tr key={row.term} onClick={()=>handleSelectRow(row.term)} style={{background:bg,cursor:'pointer'}}
                        onMouseEnter={e=>(e.currentTarget.style.background=isSel?'#1f3a1f':'#2e2e31')}
                        onMouseLeave={e=>(e.currentTarget.style.background=bg)}>
                        <td style={TDC}>
                          <div style={{width:16,height:16,borderRadius:'50%',border:`2px solid ${isSel?'#4ade80':'#52525b'}`,background:isSel?'#4ade80':'transparent',display:'inline-flex',alignItems:'center',justifyContent:'center'}}>
                            {isSel&&<div style={{width:6,height:6,borderRadius:'50%',background:'#000'}}/>}
                          </div>
                        </td>
                        {/* Fixed-width term cell with tooltip */}
                        <td title={topMode!=="asins"?row.term:undefined} style={{...TDL,width:TERM_COL_WIDTH,minWidth:TERM_COL_WIDTH,maxWidth:TERM_COL_WIDTH}}>
                          {topMode==='asins'
                            ? <a href={`https://www.amazon.com/dp/${row.term}`} target="_blank" rel="noopener noreferrer"
                                onClick={e=>e.stopPropagation()} style={{fontSize:12,fontWeight:700,color:'#60a5fa',fontFamily:'monospace'}}>{row.term}</a>
                            : <CopyCell text={row.term} fontSize={12} fontWeight={700} color='#fff' maxWidth={TERM_COL_WIDTH-20}/>
                          }
                        </td>
                        {sqpOn&&topMode==='keywords'&&(
                          <td style={TDSQPF}>
                            {sqp?<KC main={fmtK(sqp.searchVolume)} wow={sqp.searchVolumeDelta}/>:sqpLoading?<div style={{fontSize:10,color:'#52525b',textAlign:'center'}}>…</div>:<div style={{fontSize:10,color:'#52525b',textAlign:'center'}}>—</div>}
                          </td>
                        )}
                        <td style={TD}><KC main={fmtK(row.impressions)}  wow={row.impDelta}/></td>
                        <td style={TD}><KC main={fmtK(row.clicks)}        wow={row.clkDelta}/></td>
                        <td style={TD}><KC main={fmtPct(row.ctr)}         wow={row.ctrDelta} yellow isPP/></td>
                        <td style={TD}><KC main={String(row.orders)}      wow={row.ordDelta}/></td>
                        <td style={TD}><KC main={fmtPct(row.cvr)}         wow={row.cvrDelta} yellow isPP/></td>
                        <td style={TD}><KC main={fmtCcy(row.cpc)}         wow={row.cpcDelta} yellow/></td>
                        <td style={TD}><KC main={fmtCcy(row.spend)}       wow={row.spendDelta} yellow/></td>
                        <td style={TD}><KC main={fmtCcy(row.sales)}       wow={row.salesDelta} yellow/></td>
                        <td style={TD}><KC main={fmtPct(row.acos)}        wow={row.acosDelta} yellow inv isPP/></td>
                        <td style={TD}><KC main={fmtX(row.roas)}          wow={row.roasDelta}/></td>
                        {sqpOn&&topMode==='keywords'&&(
                          <>
                            <td style={TDSQP}>{sqp?<KC main={`${sqp.impressionShare.toFixed(1)}%`} wow={sqp.impressionShareDelta} isPP/>:<div style={{fontSize:10,color:'#52525b',textAlign:'center'}}>—</div>}</td>
                            <td style={TDSQP}>{sqp?<KC main={`${sqp.clickShare.toFixed(1)}%`}      wow={sqp.clickShareDelta}      isPP/>:<div style={{fontSize:10,color:'#52525b',textAlign:'center'}}>—</div>}</td>
                            <td style={TDSQP}>{sqp?<KC main={`${sqp.cartShare.toFixed(1)}%`}       wow={sqp.cartShareDelta}       isPP/>:<div style={{fontSize:10,color:'#52525b',textAlign:'center'}}>—</div>}</td>
                            <td style={TDSQP}>{sqp?<KC main={`${sqp.purchaseShare.toFixed(1)}%`}   wow={sqp.purchaseShareDelta}   isPP/>:<div style={{fontSize:10,color:'#52525b',textAlign:'center'}}>—</div>}</td>
                            <td style={TDSQP}>{sqp?<KC main={`${sqp.revenueShare.toFixed(1)}%`}    wow={sqp.revenueShareDelta}    isPP/>:<div style={{fontSize:10,color:'#52525b',textAlign:'center'}}>—</div>}</td>
                          </>
                        )}
                        <td style={{...TDC}} onClick={e=>e.stopPropagation()}>
                          <SDB onClick={()=>openShowData({ title: row.term, term: row.term })}/>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {processedRows.length>0&&(
            <div className="flex items-center justify-between px-5 py-3 border-t border-zinc-700 bg-zinc-900/30">
              <div className="text-xs text-zinc-500">{(page-1)*PAGE_SIZE+1}–{Math.min(page*PAGE_SIZE,processedRows.length)} of {processedRows.length} · {filterBadge()}</div>
              <div className="flex gap-1.5">
                {page>1&&<button onClick={()=>setPage(p=>p-1)} className="px-2.5 py-1 text-xs font-bold bg-zinc-700 border border-zinc-600 rounded text-zinc-300 hover:bg-zinc-600">←</button>}
                {Array.from({length:Math.min(totalPages,7)},(_,i)=>i+1).map(p=>(
                  <button key={p} onClick={()=>setPage(p)} className={`px-2.5 py-1 text-xs font-bold border rounded ${page===p?'bg-orange-500 border-orange-500 text-white':'bg-zinc-700 border-zinc-600 text-zinc-300 hover:bg-zinc-600'}`}>{p}</button>
                ))}
                {totalPages>7&&<span className="text-zinc-600 text-xs px-1 self-center">…</span>}
                {page<totalPages&&<button onClick={()=>setPage(p=>p+1)} className="px-2.5 py-1 text-xs font-bold bg-zinc-700 border border-zinc-600 rounded text-zinc-300 hover:bg-zinc-600">→</button>}
              </div>
            </div>
          )}
        </div>

        {/* ══ FAMILY DISTRIBUTION (4 levels) ══ */}
        <div className="bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-700 cursor-pointer" onClick={()=>setS1Open(o=>!o)}>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <svg className={`w-4 h-4 text-zinc-500 transition-transform ${s1Open?'rotate-90':''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7"/></svg>
                Family Distribution
                {selectedTerm&&<Bc>{selectedTerm}</Bc>}
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">{selectedTerm?'All families · Family → Ad Type → Match → Campaign · sorted by spend ↓':'Select a row above'}</p>
            </div>
          </div>
          {s1Open&&(
            !selectedTerm?<div className="flex items-center justify-center py-10"><p className="text-xs text-zinc-500">Select a search term above</p></div>
            :familyLoading?<div className="flex items-center justify-center py-10 gap-3"><div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"/><span className="text-xs text-zinc-400">Loading...</span></div>
            :!familyData?.length?<div className="text-center py-10 text-xs text-zinc-500">No data found</div>
            :(
              <div style={{overflowX:'auto'}}>
                <table style={{borderCollapse:'collapse',width:'100%',fontSize:11}}>
                  <thead><tr><th style={{...THL,minWidth:280,color:'#e4e4e7'}}>Family / Ad Type / Match / Campaign</th>{kpiThsNoAction()}</tr></thead>
                  <tbody>
                    {familyData.map(fam=>{
                      const fKey=fam.familyName,fOpen=expandedFam.has(fKey);
                      return (
                        <React.Fragment key={fKey}>
                          {/* L1: Family */}
                          <tr style={{background:BG_L1,cursor:'pointer'}} onClick={()=>togSet(expandedFam,setExpandedFam,fKey)}
                            onMouseEnter={e=>(e.currentTarget.style.background=BG_L1H)} onMouseLeave={e=>(e.currentTarget.style.background=BG_L1)}>
                            <td style={{...TDL,borderLeft:LB_L1}}><div style={{display:'flex',alignItems:'center',gap:7}}>
                              <span style={{fontSize:10,color:'#71717a',display:'inline-block',transform:fOpen?'rotate(90deg)':'none',transition:'transform 0.15s'}}>▶</span>
                              <span title={fam.familyName} style={{fontSize:12,fontWeight:700,color:'#fff',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:220}}>{fam.familyName}</span>
                            </div></td>
                            {kpiTds(fam,12)}
                          </tr>
                          {fOpen&&fam.adTypes.map(at=>{
                            const aKey=`${fKey}||${at.adType}`,aOpen=expandedAt.has(aKey);
                            return (
                              <React.Fragment key={aKey}>
                                {/* L2: Ad Type */}
                                <tr style={{background:BG_L2,cursor:'pointer'}} onClick={()=>togSet(expandedAt,setExpandedAt,aKey)}
                                  onMouseEnter={e=>(e.currentTarget.style.background=BG_L2H)} onMouseLeave={e=>(e.currentTarget.style.background=BG_L2)}>
                                  <td style={{...TDL,paddingLeft:24,borderLeft:LB_L2}}><div style={{display:'flex',alignItems:'center',gap:7}}>
                                    <span style={{fontSize:10,color:'#71717a',display:'inline-block',transform:aOpen?'rotate(90deg)':'none'}}>▶</span>
                                    <AdTag type={at.adType}/><span style={{fontSize:11,fontWeight:700,color:'#d4d4d8'}}>{at.adType==='SP'?'Sponsored Products':'Sponsored Brands'}</span>
                                  </div></td>
                                  {kpiTds(at,11)}
                                </tr>
                                {aOpen&&at.matchTypes.map(mt=>{
                                  const mKey=`${aKey}||${mt.matchType}`,mOpen=expandedMtF.has(mKey);
                                  return (
                                    <React.Fragment key={mKey}>
                                      {/* L3: Match Type */}
                                      <tr style={{background:BG_L3,cursor:'pointer'}} onClick={()=>togSet(expandedMtF,setExpandedMtF,mKey)}
                                        onMouseEnter={e=>(e.currentTarget.style.background=BG_L3H)} onMouseLeave={e=>(e.currentTarget.style.background=BG_L3)}>
                                        <td style={{...TDL,paddingLeft:44,borderLeft:LB_L3}}><div style={{display:'flex',alignItems:'center',gap:7}}>
                                          <span style={{fontSize:10,color:'#71717a',display:'inline-block',transform:mOpen?'rotate(90deg)':'none'}}>▶</span>
                                          <MtTag type={mt.matchType}/>
                                        </div></td>
                                        {kpiTds(mt,11)}
                                      </tr>
                                      {/* L4: Campaigns */}
                                      {mOpen&&mt.campaigns.map(camp=>(
                                        <tr key={camp.campaignName} style={{background:BG_L4}}
                                          onMouseEnter={e=>(e.currentTarget.style.background=BG_L4H)} onMouseLeave={e=>(e.currentTarget.style.background=BG_L4)}>
                                          <td title={camp.campaignName} style={{...TDL,paddingLeft:64,borderLeft:LB_L4}}>
                                            <div style={{display:'flex',alignItems:'center',gap:6}}>
                                              <div style={{width:2,height:12,background:'#3f3f46',borderRadius:2,flexShrink:0}}/>
                                              <CopyCell text={camp.campaignName} fontSize={10} fontWeight={600} color='#71717a' maxWidth={190}/>
                                            </div>
                                          </td>
                                          {kpiTds(camp,10)}
                                        </tr>
                                      ))}
                                      {mOpen&&<SubtotalRow label={`Subtotal · ${mt.campaigns.length} campaign${mt.campaigns.length!==1?'s':''}`} r={mt} indent={64}/>}
                                    </React.Fragment>
                                  );
                                })}
                                {aOpen&&<SubtotalRow label={`Subtotal · ${at.matchTypes.length} match type${at.matchTypes.length!==1?'s':''}`} r={at} indent={44}/>}
                              </React.Fragment>
                            );
                          })}
                          {fOpen&&<SubtotalRow label={`Subtotal · ${fam.adTypes.length} ad type${fam.adTypes.length!==1?'s':''}`} r={fam} indent={24}/>}
                        </React.Fragment>
                      );
                    })}
                    {familyTotal&&(
                      <tr style={{background:BG_TOT}}>
                        <td style={{...TDL,color:'#f97316',fontWeight:800,borderTop:'2px solid rgba(255,255,255,0.18)'}}>Total · All Families</td>
                        {totTds({...familyTotal,pctSpend:100,pctSales:100})}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>

        {/* ══ MTA 2.0 ══ */}
        <div className="bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-700 flex-wrap gap-3">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                Match Type Analysis 2.0
                {selectedTerm&&<Bc>{selectedTerm}</Bc>}
                <span style={{fontSize:10,fontWeight:700,borderRadius:4,padding:'2px 8px',...atStyle(adType)}}>{atLabel(adType)}</span>
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">{selectedTerm?'Ad type from top filter · Match Type → Campaigns · sorted by spend ↓':'Select a row above'}</p>
            </div>
          </div>

          {!selectedTerm?(
            <div className="flex flex-col items-center py-10 gap-2">
              <svg className="w-8 h-8 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
              <p className="text-xs text-zinc-500 font-semibold">Select a search term above</p>
            </div>
          ):mtLoading?(
            <div className="flex items-center justify-center py-10 gap-3"><div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"/><span className="text-xs text-zinc-400">Loading...</span></div>
          ):!mtData?.length?(
            <div className="text-center py-10 text-xs text-zinc-500">No data found</div>
          ):(
            <div style={{overflowX:'auto'}}>
              <table style={{borderCollapse:'collapse',width:'100%',fontSize:11}}>
                <thead><tr><th style={{...THL,minWidth:260,color:'#e4e4e7'}}>Match Type / Campaign</th>{kpiThs(true)}</tr></thead>
                <tbody>
                  {mtData.map(mt=>{
                    const mOpen=expandedMt.has(mt.matchType);
                    return (
                      <React.Fragment key={mt.matchType}>
                        {/* L1: Match Type */}
                        <tr style={{background:BG_L1,cursor:'pointer'}} onClick={()=>togSet(expandedMt,setExpandedMt,mt.matchType)}
                          onMouseEnter={e=>(e.currentTarget.style.background=BG_L1H)} onMouseLeave={e=>(e.currentTarget.style.background=BG_L1)}>
                          <td style={{...TDL,borderLeft:LB_L1}}><div style={{display:'flex',alignItems:'center',gap:7}}>
                            <span style={{fontSize:10,color:'#71717a',display:'inline-block',transform:mOpen?'rotate(90deg)':'none',transition:'transform 0.15s'}}>▶</span>
                            <MtTag type={mt.matchType}/>
                            <span style={{fontSize:12,fontWeight:700,color:'#fff'}}>{mt.matchType.charAt(0).toUpperCase()+mt.matchType.slice(1)} Match</span>
                            {mt.adTypes.map(at=><AdTag key={at} type={at}/>)}
                          </div></td>
                          {kpiTds(mt,12,()=>openShowData({ title:`${mt.matchType} Match`, matchType:mt.matchType, term:selectedTerm??undefined }))}
                        </tr>
                        {/* L2: Campaigns */}
                        {mOpen&&mt.campaigns.map(camp=>(
                          <tr key={`${camp.adType}||${camp.campaignName}`} style={{background:BG_L2}}
                            onMouseEnter={e=>(e.currentTarget.style.background=BG_L2H)} onMouseLeave={e=>(e.currentTarget.style.background=BG_L2)}>
                            <td title={camp.campaignName} style={{...TDL,paddingLeft:28,borderLeft:LB_L2}}><div style={{display:'flex',alignItems:'center',gap:7}}>
                              <div style={{width:2,height:14,background:'#3f3f46',borderRadius:2,flexShrink:0}}/>
                              <AdTag type={camp.adType}/>
                              <CopyCell text={camp.campaignName} fontSize={11} fontWeight={600} color='#c4c4c8' maxWidth={210}/>
                            </div></td>
                            {kpiTds(camp,11,()=>openShowData({ title:camp.campaignName, adType:camp.adType, matchType:mt.matchType, campaignName:camp.campaignName, term:selectedTerm??undefined }))}
                          </tr>
                        ))}
                        {mOpen&&<SubtotalRow label={`Subtotal · ${mt.campaigns.length} campaign${mt.campaigns.length!==1?'s':''}`} r={mt} indent={28}/>}
                      </React.Fragment>
                    );
                  })}
                  {mtTotal&&(
                    <tr style={{background:BG_TOT}}>
                      <td style={{...TDL,color:'#f97316',fontWeight:800,borderTop:'2px solid rgba(255,255,255,0.18)'}}>Total · {mtData.length} match types · {atLabel(adType)}</td>
                      {totTds({...mtTotal,pctSpend:100,pctSales:100})}
                      <td style={{...TD,borderTop:'2px solid rgba(255,255,255,0.18)',verticalAlign:'middle'}}>
                        <SDB onClick={()=>openShowData({title:'All Match Types',term:selectedTerm??undefined})}/>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      {/* ── SHOW DATA MODAL ── */}
      <ShowDataModal
        open={sdOpen} onClose={()=>setSdOpen(false)} config={sdConfig}
        dateOptions={dateOptions} mode={mode}
        brands={selBrand?[selBrand]:[]} families={selFamily?[selFamily]:[]}
        adType={adType} startDate={startDate} endDate={endDate}
        sqpOn={sqpOn} topMode={topMode}
      />
    </div>
  );
}