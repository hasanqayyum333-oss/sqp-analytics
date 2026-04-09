'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { generateWeeks, generateMonths } from '../filter-context';
import type { WeekOption, MonthOption } from '../filter-context';

const ALL_WEEKS  = generateWeeks();
const ALL_MONTHS = generateMonths();

// ─── TYPES ────────────────────────────────────────────────────────────────────
type S1Row = {
  searchTerm: string; periodNumber: number; year: number; dateKey: string; dateEnd: string;
  searchVolume: number; prevSearchVolume: number | null;
  mktImp: number; ourImp: number; impShare: number;
  mktClk: number; ourClk: number; clkShare: number;
  mktCart: number; ourCart: number; cartShare: number;
  mktPur: number; ourPur: number; purShare: number;
  mktRev: number; ourRev: number; revShare: number;
  prevImpShare: number|null; prevClkShare: number|null;
  prevCartShare: number|null; prevPurShare: number|null; prevRevShare: number|null;
  prevMktImp: number|null; prevOurImp: number|null;
  prevMktClk: number|null; prevOurClk: number|null;
  prevMktCart: number|null; prevOurCart: number|null;
  prevMktPur: number|null; prevOurPur: number|null;
  prevMktRev: number|null; prevOurRev: number|null;
  adsImp: number|null; adsClk: number|null; adsCtr: number|null;
  adsOrders: number|null; adsCvr: number|null;
  adsSpend: number|null; adsSales: number|null; adsAcos: number|null;
  prevAdsImp: number|null; prevAdsClk: number|null;
  prevAdsOrders: number|null; prevAdsSpend: number|null; prevAdsSales: number|null;
};

type ShareBucket = {
  impShare:number; ourImp:number; mktImp:number;
  clkShare:number; ourClk:number; mktClk:number;
  cartShare:number; ourCart:number; mktCart:number;
  purShare:number; ourPur:number; mktPur:number;
  revShare:number; ourRev:number; mktRev:number;
};

type S3Bucket = {
  nbImp:number; brImp:number; nbClk:number; brClk:number;
  nbCart:number; brCart:number; nbPur:number; brPur:number;
  nbRev:number; brRev:number; nbSpend:number; brSpend:number;
  nbSales:number; brSales:number; nbAcos:number; brAcos:number;
};

type PeriodRow = {
  dateKey:string; periodNumber:number; year:number;
  nb: ShareBucket; br: ShareBucket; s3: S3Bucket;
};

type Opt = { value: string; label: string };

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function fmtK(n: number) {
  if (n >= 1_000_000) return `${(n/1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n/1_000).toFixed(1)}K`;
  return Math.round(n).toLocaleString();
}
function fmtCcy(n: number) {
  if (n >= 1_000_000) return `$${(n/1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n/1_000).toFixed(1)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}
function pctFmt(n: number, d = 1) { return `${n.toFixed(d)}%`; }
function wowPct(curr: number, prev: number|null) {
  if (prev === null || prev === 0) return null;
  const p = ((curr - prev) / Math.abs(prev)) * 100;
  return { val: `${p >= 0 ? '+' : ''}${p.toFixed(1)}%`, pos: p >= 0 };
}

// ─── DELTA DISPLAY ────────────────────────────────────────────────────────────
function Delta({ d }: { d: { val: string; pos: boolean } | null }) {
  if (!d) return null;
  return <span style={{ fontSize: 9, display: 'block', color: d.pos ? '#4ade80' : '#f87171' }}>{d.pos ? '↑ ' : '↓ '}{d.val}</span>;
}
function PctDelta({ v }: { v: number|null }) {
  if (v === null) return null;
  return <Delta d={{ val: `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`, pos: v >= 0 }} />;
}

// ─── RESIZABLE / DRAGGABLE MODAL ─────────────────────────────────────────────
type ResizeState = { active: boolean; dir: string; startX: number; startY: number; startW: number; startH: number; startL: number; startT: number } | null;

function DataModal({ onClose, children, title, subtitle, toolbar }: {
  onClose: () => void; children: React.ReactNode; title: string; subtitle?: string; toolbar?: React.ReactNode;
}) {
  const [dims, setDims] = useState({ w: 0, h: 540, l: 0, t: 0, ready: false });
  const dimsRef     = useRef(dims);
  const resizingRef = useRef<ResizeState>(null);
  const modalRef    = useRef<HTMLDivElement>(null);
  const minW        = useRef(0);

  useEffect(() => { dimsRef.current = dims; }, [dims]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const w = Math.round(window.innerWidth * 0.72);
      minW.current = Math.round(window.innerWidth * 0.42);
      setDims({ w, h: 540, l: Math.round((window.innerWidth - w) / 2), t: Math.round((window.innerHeight - 540) / 2), ready: true });
    }
  }, []);

  useEffect(() => {
    const applyPos = (l: number, t: number, w: number, h: number) => {
      const el = modalRef.current; if (!el) return;
      el.style.left = `${l}px`; el.style.top = `${t}px`; el.style.width = `${w}px`; el.style.height = `${h}px`;
    };
    const onMove = (e: MouseEvent) => {
      const r = resizingRef.current; if (!r?.active) return;
      const dx = e.clientX - r.startX; const dy = e.clientY - r.startY;
      const MIN_W = minW.current; const MIN_H = 320;
      let { w, h, l, t } = { w: r.startW, h: r.startH, l: r.startL, t: r.startT };
      if (r.dir === 'drag') { l = r.startL + dx; t = r.startT + dy; }
      else {
        if (r.dir.includes('e')) w = Math.max(MIN_W, r.startW + dx);
        if (r.dir.includes('s')) h = Math.max(MIN_H, r.startH + dy);
        if (r.dir.includes('w')) { const nw = Math.max(MIN_W, r.startW - dx); l = r.startL + (r.startW - nw); w = nw; }
        if (r.dir.includes('n')) { const nh = Math.max(MIN_H, r.startH - dy); t = r.startT + (r.startH - nh); h = nh; }
      }
      applyPos(l, t, w, h);
    };
    const onUp = () => {
      const r = resizingRef.current; if (!r?.active) return;
      resizingRef.current = { ...r, active: false };
      const el = modalRef.current;
      if (el) setDims({ w: parseFloat(el.style.width), h: parseFloat(el.style.height), l: parseFloat(el.style.left), t: parseFloat(el.style.top), ready: true });
    };
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h); return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  if (!dims.ready) return null;

  const startResize = (e: React.MouseEvent, dir: string) => {
    e.preventDefault(); e.stopPropagation();
    const el = modalRef.current; if (!el) return;
    resizingRef.current = { active: true, dir, startX: e.clientX, startY: e.clientY, startW: parseFloat(el.style.width) || dims.w, startH: parseFloat(el.style.height) || dims.h, startL: parseFloat(el.style.left) || dims.l, startT: parseFloat(el.style.top) || dims.t };
  };
  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const el = modalRef.current; if (!el) return;
    resizingRef.current = { active: true, dir: 'drag', startX: e.clientX, startY: e.clientY, startW: parseFloat(el.style.width) || dims.w, startH: parseFloat(el.style.height) || dims.h, startL: parseFloat(el.style.left) || dims.l, startT: parseFloat(el.style.top) || dims.t };
  };

  const E = 6;
  const edge = (extra: React.CSSProperties): React.CSSProperties => ({ position: 'absolute', zIndex: 10, ...extra });

  return (
    <div className="fixed inset-0 z-50" style={{ pointerEvents: 'none' }}>
      <div className="absolute inset-0 bg-black/70" style={{ pointerEvents: 'auto' }} onClick={onClose} />
      <div ref={modalRef} className="absolute bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl flex flex-col"
        style={{ width: dims.w, height: dims.h, left: dims.l, top: dims.t, pointerEvents: 'auto', minWidth: minW.current, minHeight: 320, overflow: 'hidden' }}>
        {/* Resize handles */}
        <div style={edge({ top: 0, left: E, right: E, height: E, cursor: 'n-resize' })}  onMouseDown={e => startResize(e, 'n')} />
        <div style={edge({ bottom: 0, left: E, right: E, height: E, cursor: 's-resize' })} onMouseDown={e => startResize(e, 's')} />
        <div style={edge({ left: 0, top: E, bottom: E, width: E, cursor: 'w-resize' })}  onMouseDown={e => startResize(e, 'w')} />
        <div style={edge({ right: 0, top: E, bottom: E, width: E, cursor: 'e-resize' })} onMouseDown={e => startResize(e, 'e')} />
        <div style={edge({ top: 0, left: 0, width: E, height: E, cursor: 'nw-resize' })} onMouseDown={e => startResize(e, 'nw')} />
        <div style={edge({ top: 0, right: 0, width: E, height: E, cursor: 'ne-resize' })} onMouseDown={e => startResize(e, 'ne')} />
        <div style={edge({ bottom: 0, left: 0, width: E, height: E, cursor: 'sw-resize' })} onMouseDown={e => startResize(e, 'sw')} />
        <div style={edge({ bottom: 0, right: 0, width: E, height: E, cursor: 'se-resize' })} onMouseDown={e => startResize(e, 'se')} />
        {/* Draggable header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-700 flex-shrink-0"
          style={{ cursor: 'move', userSelect: 'none', background: '#18181b' }} onMouseDown={startDrag}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{title}</span>
              <span style={{ fontSize: 9, fontWeight: 700, background: '#14532d', color: '#4ade80', borderRadius: 3, padding: '1px 6px' }}>branded</span>
            </div>
            {subtitle && <p style={{ fontSize: 11, color: '#71717a', marginTop: 2 }}>{subtitle}</p>}
          </div>
          <button onClick={onClose} onMouseDown={e => e.stopPropagation()}
            className="text-zinc-400 hover:text-white transition-colors p-1 rounded hover:bg-zinc-700">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        {/* Non-scrolling toolbar area */}
        {toolbar && <div style={{ flexShrink: 0 }}>{toolbar}</div>}
        {/* Scrollable content */}
        <div style={{ overflow: 'auto', flex: 1 }}>
          <div style={{ minWidth: 'max-content' }}>{children}</div>
        </div>
      </div>
    </div>
  );
}

// ─── SHOW-DATA MODAL ──────────────────────────────────────────────────────────
type SdRow = {
  dateKey:string; periodNumber:number; year:number; dateEnd:string;
  searchVolume:number; svDelta:number|null;
  impShare:number;  impDelta:number|null;
  clkShare:number;  clkDelta:number|null;
  cartShare:number; cartDelta:number|null;
  purShare:number;  purDelta:number|null;
  adsImp:number|null; adsClk:number|null; adsOrders:number|null;
  adsSpend:number|null; adsSales:number|null; adsAcos:number|null;
  adsImpDelta:number|null; adsClkDelta:number|null; adsOrdDelta:number|null;
  adsSpendDelta:number|null; adsSalesDelta:number|null; adsAcosDelta:number|null;
};

function ShowDataModal({ term, brand, families, mode, onClose }: {
  term: string; brand: string; families: string[]; mode: 'weekly'|'monthly'; onClose: () => void;
}) {
  const isMonthly = mode === 'monthly';
  const allPeriods = isMonthly ? ALL_MONTHS : ALL_WEEKS;
  const [startP, setStartP] = useState(allPeriods[Math.min(9, allPeriods.length-1)]);
  const [endP,   setEndP]   = useState(allPeriods[0]);
  const [rows,   setRows]   = useState<SdRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dashboard/branded', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'show-data', brand, families, mode, term,
          startDate: startP.start,
          endDate: isMonthly ? (endP as MonthOption).end : (endP as WeekOption).end,
        }),
      });
      const d = await res.json();
      setRows(d.data ?? []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [brand, families, mode, term, startP, endP, isMonthly]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toolbar = (
    <div style={{ padding: '10px 20px', borderBottom: '1px solid #3f3f46', display: 'flex', alignItems: 'flex-end', gap: 12, background: '#18181b', flexWrap: 'wrap' }}>
      {isMonthly ? (<>
        <MonthDropdown label="Start Month" value={startP as MonthOption} onChange={m => { setStartP(m); if (m.start > endP.start) setEndP(m); }} />
        <MonthDropdown label="End Month" value={endP as MonthOption} onChange={setEndP} maxMonth={startP as MonthOption} />
      </>) : (<>
        <WeekDropdown label="Start Week" value={startP as WeekOption} onChange={w => { setStartP(w); if (w.start > endP.start) setEndP(w); }} />
        <WeekDropdown label="End Week" value={endP as WeekOption} onChange={setEndP} maxWeek={startP as WeekOption} />
      </>)}
      <button onClick={load} disabled={loading}
        style={{ padding: '6px 14px', background: '#f97316', color: '#fff', border: 'none', borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: 'pointer', opacity: loading ? 0.5 : 1, alignSelf: 'flex-end' }}>
        {loading ? 'Loading…' : 'Apply'}
      </button>
    </div>
  );

  return (
    <DataModal onClose={onClose} title={term} subtitle={`${isMonthly ? 'Monthly' : 'Weekly'} trend — SQP + Ads data`} toolbar={toolbar}>
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, gap: 10 }}>
          <div style={{ width: 18, height: 18, border: '2px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <span style={{ color: '#a1a1aa', fontSize: 12 }}>Loading…</span>
        </div>
      ) : rows.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#52525b', fontSize: 12 }}>No data for this period</div>
      ) : (
        <table style={{ borderCollapse: 'collapse', fontSize: 10, minWidth: 'max-content', width: '100%' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 2, background: '#18181b' }}>
            <tr>
              <th style={{ ...GH, textAlign: 'left', background: '#27272a', color: '#a1a1aa', borderBottom: HB, padding: '8px 12px', verticalAlign: 'bottom', whiteSpace: 'nowrap' }}>{isMonthly ? 'Month' : 'Week'}</th>
              <th style={{ ...GH, background: BG.sqp, color: FG.sqp, borderLeft: WB, borderBottom: HB, verticalAlign: 'bottom', fontSize: 11 }}>Search Vol</th>
              <th style={{ ...GH, background: BG.sqp, color: FG.sqp, borderBottom: HB, verticalAlign: 'bottom', fontSize: 11 }}>Imp %</th>
              <th style={{ ...GH, background: BG.sqp, color: FG.sqp, borderBottom: HB, verticalAlign: 'bottom', fontSize: 11 }}>Click %</th>
              <th style={{ ...GH, background: BG.sqp, color: FG.sqp, borderBottom: HB, verticalAlign: 'bottom', fontSize: 11 }}>Cart %</th>
              <th style={{ ...GH, background: BG.sqp, color: FG.sqp, borderBottom: HB, verticalAlign: 'bottom', fontSize: 11 }}>Purchase %</th>
              <th style={{ ...GH, background: BG.ads, color: FG.ads, borderLeft: WB, borderBottom: HB, verticalAlign: 'bottom', fontSize: 11 }}>Ads Imp</th>
              <th style={{ ...GH, background: BG.ads, color: FG.ads, borderBottom: HB, verticalAlign: 'bottom', fontSize: 11 }}>Clicks</th>
              <th style={{ ...GH, background: BG.ads, color: FG.ads, borderBottom: HB, verticalAlign: 'bottom', fontSize: 11 }}>Orders</th>
              <th style={{ ...GH, background: BG.ads, color: FG.ads, borderBottom: HB, verticalAlign: 'bottom', fontSize: 11 }}>Spend</th>
              <th style={{ ...GH, background: BG.ads, color: FG.ads, borderBottom: HB, verticalAlign: 'bottom', fontSize: 11 }}>Sales</th>
              <th style={{ ...GH, background: BG.ads, color: FG.ads, borderBottom: HB, verticalAlign: 'bottom', fontSize: 11 }}>ACoS%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const label = isMonthly ? `${r.periodNumber}/${r.year}` : `W${r.periodNumber}/${r.year}`;
              return (
                <tr key={r.dateKey}
                  onMouseEnter={e => (e.currentTarget.style.background = '#27272a')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ ...TD, textAlign: 'left', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{label}</td>
                  <td style={{ ...TD, borderLeft: WB }}>
                    <div style={{ fontWeight: 700, color: '#e4e4e7' }}>{fmtK(r.searchVolume)}</div>
                    <PctDelta v={r.svDelta} />
                  </td>
                  <td style={{ ...TD }}><div style={{ color: '#60a5fa', fontWeight: 700 }}>{pctFmt(r.impShare)}</div><PctDelta v={r.impDelta} /></td>
                  <td style={{ ...TD }}><div style={{ color: '#86efac', fontWeight: 700 }}>{pctFmt(r.clkShare)}</div><PctDelta v={r.clkDelta} /></td>
                  <td style={{ ...TD }}><div style={{ color: '#fca5a5', fontWeight: 700 }}>{pctFmt(r.cartShare)}</div><PctDelta v={r.cartDelta} /></td>
                  <td style={{ ...TD }}><div style={{ color: '#facc15', fontWeight: 700 }}>{pctFmt(r.purShare)}</div><PctDelta v={r.purDelta} /></td>
                  {r.adsImp !== null ? <>
                    <td style={{ ...TD, borderLeft: WB }}><div style={{ color: '#e4e4e7' }}>{fmtK(r.adsImp)}</div><PctDelta v={r.adsImpDelta} /></td>
                    <td style={{ ...TD }}><div style={{ color: '#e4e4e7' }}>{fmtK(r.adsClk ?? 0)}</div><PctDelta v={r.adsClkDelta} /></td>
                    <td style={{ ...TD }}><div style={{ color: '#e4e4e7' }}>{fmtK(r.adsOrders ?? 0)}</div><PctDelta v={r.adsOrdDelta} /></td>
                    <td style={{ ...TD }}><div style={{ color: '#facc15', fontWeight: 700 }}>{fmtCcy(r.adsSpend ?? 0)}</div><PctDelta v={r.adsSpendDelta} /></td>
                    <td style={{ ...TD }}><div style={{ color: '#e4e4e7' }}>{fmtCcy(r.adsSales ?? 0)}</div><PctDelta v={r.adsSalesDelta} /></td>
                    <td style={{ ...TD }}><div style={{ color: r.adsAcos != null && r.adsAcos < 25 ? '#4ade80' : '#f87171', fontWeight: 700 }}>{r.adsAcos != null ? pctFmt(r.adsAcos, 2) : '—'}</div><PctDelta v={r.adsAcosDelta} /></td>
                  </> : <td colSpan={6} style={{ ...TD, borderLeft: WB, color: '#52525b', textAlign: 'center' }}>—</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </DataModal>
  );
}

// ─── TABLE CONSTANTS ──────────────────────────────────────────────────────────
const WB  = '2px solid rgba(255,255,255,0.20)';
const HB  = '2px solid rgba(255,255,255,0.25)';
const RB  = '1px solid rgba(255,255,255,0.10)';
const GH: React.CSSProperties  = { padding: '5px 8px 3px', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' };
const SH2: React.CSSProperties = { padding: '4px 8px', fontSize: 9, fontWeight: 700, textAlign: 'center', borderBottom: HB, whiteSpace: 'nowrap', verticalAlign: 'bottom' };
const TD: React.CSSProperties  = { padding: '6px 8px', textAlign: 'center', verticalAlign: 'top', borderBottom: RB };
const TOT: React.CSSProperties = { padding: '6px 8px', textAlign: 'center', verticalAlign: 'top' };
// EB: inline-block so textAlign:center on parent <th> centers it
const EB: React.CSSProperties  = { background: '#3f3f46', border: 'none', color: '#d4d4d8', fontSize: 8, fontWeight: 700, padding: '1px 6px', borderRadius: 2, cursor: 'pointer', display: 'inline-block', marginTop: 2, whiteSpace: 'nowrap' };
const BG = { sqp:'#1a2744', ads:'#1c2b1a', imp:'#1a2744', clk:'#1c2b1a', cart:'#2b1c1a', pur:'#1e1b2e', rev:'#1a2b20', spd:'#2b1f0e', sls:'#1a2b1a', acs:'#2b1414' };
const FG = { sqp:'#60a5fa', ads:'#86efac', imp:'#60a5fa', clk:'#86efac', cart:'#fca5a5', pur:'#c4b5fd', rev:'#6ee7b7', spd:'#fbbf24', sls:'#86efac', acs:'#fca5a5' };
const TOTBG = 'rgba(249,115,22,0.07)';
const TOTBDR = '2px solid rgba(249,115,22,0.35)';

// ─── DROPDOWN COMPONENTS ──────────────────────────────────────────────────────
function BrandSelect({ opts, value, onChange }: { opts: Opt[]; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false); const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch(''); } }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);
  const filtered = opts.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));
  return (
    <div ref={ref} className="relative">
      <label className="block text-xs font-bold text-white mb-1 uppercase tracking-wide">Brand</label>
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 bg-zinc-700 border border-zinc-600 text-white text-sm rounded px-3 py-2 hover:border-zinc-500 min-w-[140px]">
        <span className="flex-1 text-left truncate">{opts.find(o => o.value === value)?.label ?? 'Brand'}</span>
        <svg className={`w-4 h-4 text-zinc-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && <div className="absolute z-50 w-56 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl"><div className="p-2 border-b border-zinc-700"><input autoFocus type="text" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} className="w-full bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-sm text-white placeholder-zinc-500 outline-none" /></div><div className="overflow-y-auto max-h-52">{filtered.map(o => <div key={o.value} onClick={() => { onChange(o.value); setOpen(false); setSearch(''); }} className={`px-3 py-2 cursor-pointer hover:bg-zinc-700 text-sm ${value === o.value ? 'text-orange-400 bg-orange-500/10' : 'text-zinc-200'}`}>{o.label}</div>)}</div></div>}
    </div>
  );
}

function MultiSel({ opts, value, onChange, placeholder, disabled, label }: { opts: Opt[]; value: string[]; onChange: (v: string[]) => void; placeholder: string; disabled?: boolean; label?: string }) {
  const [open, setOpen] = useState(false); const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch(''); } }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);
  const filtered = opts.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v]);
  const displayText = value.length === 0 ? placeholder : value.length === 1 ? (opts.find(o => o.value === value[0])?.label ?? value[0]) : `${value.length} selected`;
  return (
    <div ref={ref} className="relative">
      {label && <span className="block text-xs font-bold text-white mb-1 uppercase tracking-wide">{label}</span>}
      <button onClick={() => !disabled && setOpen(o => !o)} disabled={disabled} className={`flex items-center gap-2 border rounded-lg px-3 py-2 text-sm min-w-[140px] ${disabled ? 'bg-zinc-900 border-zinc-800 text-zinc-600 cursor-not-allowed' : 'bg-zinc-700 border-zinc-600 text-white hover:border-zinc-500 cursor-pointer'}`}>
        <span className={`flex-1 text-left truncate ${value.length === 0 ? 'text-zinc-400' : ''}`}>{displayText}</span>
        <svg className={`w-4 h-4 text-zinc-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && <div className="absolute z-50 w-72 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl"><div className="p-2 border-b border-zinc-700"><input autoFocus type="text" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} className="w-full bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-sm text-white placeholder-zinc-500 outline-none" /></div>{value.length > 0 && <div className="px-3 py-1.5 border-b border-zinc-700"><button onClick={() => onChange([])} className="text-xs text-orange-400">Clear all</button></div>}<div className="overflow-y-auto max-h-52">{filtered.map(o => (<div key={o.value} onClick={() => toggle(o.value)} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-zinc-700"><div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${value.includes(o.value) ? 'bg-orange-500 border-orange-500' : 'border-zinc-600'}`}>{value.includes(o.value) && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}</div><span className="text-sm text-zinc-200 truncate">{o.label}</span></div>))}</div></div>}
    </div>
  );
}

function WeekDropdown({ label, value, onChange, maxWeek }: { label: string; value: WeekOption; onChange: (w: WeekOption) => void; maxWeek?: WeekOption }) {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);
  const available = maxWeek ? ALL_WEEKS.filter(w => w.start >= maxWeek!.start) : ALL_WEEKS;
  return (
    <div ref={ref} className="relative">
      <label className="block text-xs font-bold text-white mb-1 uppercase tracking-wide">{label}</label>
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 bg-zinc-700 border border-zinc-600 text-white text-xs rounded px-3 py-2 hover:border-zinc-500 min-w-[180px]">
        <span className="flex-1 text-left truncate">{value.shortLabel}</span>
        <svg className={`w-3 h-3 text-zinc-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && <div className="absolute z-50 mt-1 w-full min-w-[200px] bg-zinc-700 border border-zinc-600 rounded shadow-xl overflow-hidden"><div className="overflow-y-auto max-h-52">{available.map(w => <div key={w.start} onClick={() => { onChange(w); setOpen(false); }} className={`px-3 py-1.5 text-xs cursor-pointer ${w.start === value.start ? 'bg-orange-500 text-white' : 'text-zinc-200 hover:bg-zinc-600'}`}>{w.label}</div>)}</div></div>}
    </div>
  );
}

function MonthDropdown({ label, value, onChange, maxMonth }: { label: string; value: MonthOption; onChange: (m: MonthOption) => void; maxMonth?: MonthOption }) {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);
  const available = maxMonth ? ALL_MONTHS.filter(m => m.start >= maxMonth!.start) : ALL_MONTHS;
  return (
    <div ref={ref} className="relative">
      <label className="block text-xs font-bold text-white mb-1 uppercase tracking-wide">{label}</label>
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 bg-zinc-700 border border-zinc-600 text-white text-xs rounded px-3 py-2 hover:border-zinc-500 min-w-[160px]">
        <span className="flex-1 text-left truncate">{value.label}</span>
        <svg className={`w-3 h-3 text-zinc-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && <div className="absolute z-50 mt-1 w-full min-w-[180px] bg-zinc-700 border border-zinc-600 rounded shadow-xl overflow-hidden"><div className="overflow-y-auto max-h-52">{available.map(m => <div key={m.start} onClick={() => { onChange(m); setOpen(false); }} className={`px-3 py-1.5 text-xs cursor-pointer ${m.start === value.start ? 'bg-orange-500 text-white' : 'text-zinc-200 hover:bg-zinc-600'}`}>{m.label}</div>)}</div></div>}
    </div>
  );
}

// ─── SECTION 1 KPI CONFIG ─────────────────────────────────────────────────────
const S1_KPIS = [
  { k:'imp',  hdr:'Impressions', shareKey:'impShare'  as keyof S1Row, mktKey:'mktImp'   as keyof S1Row, ourKey:'ourImp'   as keyof S1Row, prevShareKey:'prevImpShare'  as keyof S1Row, prevMktKey:'prevMktImp'  as keyof S1Row, prevOurKey:'prevOurImp'  as keyof S1Row, isCcy:false },
  { k:'clk',  hdr:'Clicks',      shareKey:'clkShare'  as keyof S1Row, mktKey:'mktClk'   as keyof S1Row, ourKey:'ourClk'   as keyof S1Row, prevShareKey:'prevClkShare'  as keyof S1Row, prevMktKey:'prevMktClk'  as keyof S1Row, prevOurKey:'prevOurClk'  as keyof S1Row, isCcy:false },
  { k:'cart', hdr:'Cart Adds',   shareKey:'cartShare' as keyof S1Row, mktKey:'mktCart'  as keyof S1Row, ourKey:'ourCart'  as keyof S1Row, prevShareKey:'prevCartShare' as keyof S1Row, prevMktKey:'prevMktCart' as keyof S1Row, prevOurKey:'prevOurCart' as keyof S1Row, isCcy:false },
  { k:'pur',  hdr:'Purchases',   shareKey:'purShare'  as keyof S1Row, mktKey:'mktPur'   as keyof S1Row, ourKey:'ourPur'   as keyof S1Row, prevShareKey:'prevPurShare'  as keyof S1Row, prevMktKey:'prevMktPur'  as keyof S1Row, prevOurKey:'prevOurPur'  as keyof S1Row, isCcy:false },
  { k:'rev',  hdr:'Revenue',     shareKey:'revShare'  as keyof S1Row, mktKey:'mktRev'   as keyof S1Row, ourKey:'ourRev'   as keyof S1Row, prevShareKey:'prevRevShare'  as keyof S1Row, prevMktKey:'prevMktRev'  as keyof S1Row, prevOurKey:'prevOurRev'  as keyof S1Row, isCcy:true  },
];

// ─── SECTION 1 ────────────────────────────────────────────────────────────────
function Section1({ rows, isMonthly, onShowData }: { rows: S1Row[]; isMonthly: boolean; onShowData: (term: string) => void }) {
  const [exp, setExp]           = useState<Record<string,boolean>>({});
  const [sortBy, setSortBy]     = useState('ourPur');
  const [sortDir, setSortDir]   = useState<'desc'|'asc'>('desc');
  const [filterKpi, setFilterKpi]   = useState('');
  const [filterCond, setFilterCond] = useState('gt');
  const [filterVal, setFilterVal]   = useState('');
  const [search, setSearch]         = useState('');
  const [searchType, setSearchType] = useState('contains');
  const [tooltip, setTooltip]       = useState<{ text: string; x: number; y: number } | null>(null);

  const toggleExp = (k: string) => setExp(prev => ({ ...prev, [k]: !prev[k] }));

  const latest = rows[0];
  const periodLabel = latest ? (isMonthly ? `${latest.periodNumber}/${latest.year}` : `W${latest.periodNumber}/${latest.year}`) : '';

  let filtered = [...rows];
  if (search) filtered = filtered.filter(r => { const t = r.searchTerm.toLowerCase(); const q = search.toLowerCase(); return searchType === 'exact' ? t === q : searchType === 'starts' ? t.startsWith(q) : t.includes(q); });
  if (filterKpi && filterVal) { const v = parseFloat(filterVal); if (!isNaN(v)) filtered = filtered.filter(r => { const val = r[filterKpi as keyof S1Row] as number; return filterCond === 'gt' ? val > v : val < v; }); }
  filtered = filtered.sort((a, b) => { const av = a[sortBy as keyof S1Row] as number; const bv = b[sortBy as keyof S1Row] as number; return sortDir === 'desc' ? bv - av : av - bv; });

  // ── Totals ────────────────────────────────────────────────────────────────
  const totSV       = filtered.reduce((s, r) => s + r.searchVolume, 0);
  const totMktImp   = filtered.reduce((s, r) => s + r.mktImp,   0); const totOurImp   = filtered.reduce((s, r) => s + r.ourImp,   0);
  const totMktClk   = filtered.reduce((s, r) => s + r.mktClk,   0); const totOurClk   = filtered.reduce((s, r) => s + r.ourClk,   0);
  const totMktCart  = filtered.reduce((s, r) => s + r.mktCart,  0); const totOurCart  = filtered.reduce((s, r) => s + r.ourCart,  0);
  const totMktPur   = filtered.reduce((s, r) => s + r.mktPur,   0); const totOurPur   = filtered.reduce((s, r) => s + r.ourPur,   0);
  const totMktRev   = filtered.reduce((s, r) => s + r.mktRev,   0); const totOurRev   = filtered.reduce((s, r) => s + r.ourRev,   0);
  const totShares   = [totMktImp,totMktClk,totMktCart,totMktPur,totMktRev].map((mkt, i) => {
    const our = [totOurImp,totOurClk,totOurCart,totOurPur,totOurRev][i];
    return mkt > 0 ? (our / mkt) * 100 : 0;
  });
  const totOurs     = [totOurImp,totOurClk,totOurCart,totOurPur,totOurRev];
  const totMkts     = [totMktImp,totMktClk,totMktCart,totMktPur,totMktRev];
  const adsRows     = filtered.filter(r => r.adsImp !== null);
  const totAdsImp   = adsRows.reduce((s, r) => s + (r.adsImp   ?? 0), 0);
  const totAdsClk   = adsRows.reduce((s, r) => s + (r.adsClk   ?? 0), 0);
  const totAdsOrd   = adsRows.reduce((s, r) => s + (r.adsOrders ?? 0), 0);
  const totAdsSpend = adsRows.reduce((s, r) => s + (r.adsSpend  ?? 0), 0);
  const totAdsSales = adsRows.reduce((s, r) => s + (r.adsSales  ?? 0), 0);
  const totAdsCtr   = totAdsImp  > 0 ? (totAdsClk / totAdsImp)   * 100 : 0;
  const totAdsCvr   = totAdsClk  > 0 ? (totAdsOrd / totAdsClk)   * 100 : 0;
  const totAdsAcos  = totAdsSales > 0 ? (totAdsSpend / totAdsSales) * 100 : null;

  return (
    <div className="mb-4 bg-zinc-800 border border-zinc-700 rounded-lg overflow-hidden">
      {tooltip && (
        <div style={{ position: 'fixed', left: tooltip.x + 12, top: tooltip.y - 8, background: '#1c1c1e', border: '1px solid #3f3f46', borderRadius: 6, padding: '4px 8px', fontSize: 11, color: '#fff', zIndex: 9999, maxWidth: 320, pointerEvents: 'none', wordBreak: 'break-word' }}>
          {tooltip.text}
        </div>
      )}
      {/* Section header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white">Top branded search terms</span>
            <span style={{ fontSize: 9, fontWeight: 700, background: '#14532d', color: '#4ade80', borderRadius: 3, padding: '1px 6px' }}>Branded only</span>
            {periodLabel && <span className="text-xs text-zinc-400">Latest: {periodLabel}</span>}
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">SQP drives visibility · Ads joined where available · Sorted by purchase count</p>
        </div>
      </div>
      {/* Inline filters */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-700 bg-zinc-800/50 flex-wrap">
        <div className="flex items-center gap-1">
          <span className="text-xs text-zinc-400 uppercase">Sort by</span>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="bg-zinc-700 border border-zinc-600 text-white text-xs rounded px-2 py-1">
            <option value="ourPur">Purchase count</option>
            <option value="purShare">Purchase share</option>
            <option value="searchVolume">Search volume</option>
            <option value="impShare">Imp share</option>
            <option value="revShare">Rev share</option>
          </select>
          <select value={sortDir} onChange={e => setSortDir(e.target.value as 'desc'|'asc')} className="bg-zinc-700 border border-zinc-600 text-white text-xs rounded px-2 py-1">
            <option value="desc">High → Low</option><option value="asc">Low → High</option>
          </select>
        </div>
        <div className="w-px h-4 bg-zinc-600" />
        <div className="flex items-center gap-1">
          <span className="text-xs text-zinc-400 uppercase">Filter (optional)</span>
          <select value={filterKpi} onChange={e => setFilterKpi(e.target.value)} className="bg-zinc-700 border border-zinc-600 text-white text-xs rounded px-2 py-1">
            <option value="">— none —</option>
            <option value="purShare">Purchase share</option>
            <option value="impShare">Imp share</option>
            <option value="revShare">Rev share</option>
            <option value="adsAcos">ACoS%</option>
          </select>
          <select value={filterCond} onChange={e => setFilterCond(e.target.value)} className="bg-zinc-700 border border-zinc-600 text-white text-xs rounded px-2 py-1">
            <option value="gt">Greater than</option><option value="lt">Less than</option>
          </select>
          <input type="text" value={filterVal} onChange={e => setFilterVal(e.target.value)} placeholder="value" className="bg-zinc-700 border border-zinc-600 text-white text-xs rounded px-2 py-1 w-14" />
        </div>
      </div>
      {/* Search bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-700">
        <select value={searchType} onChange={e => setSearchType(e.target.value)} className="bg-zinc-700 border border-zinc-600 text-white text-xs rounded px-2 py-1">
          <option value="contains">Contains</option><option value="exact">Exact</option><option value="starts">Starts with</option>
        </select>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search keyword…" className="flex-1 max-w-xs bg-zinc-700 border border-zinc-600 text-white text-xs rounded px-2 py-1 placeholder-zinc-500 outline-none focus:border-orange-400" />
        <span className="text-xs text-zinc-500">{filtered.length} branded terms</span>
      </div>
      {/* Table — fixed height (~10 rows), internal scroll */}
      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 440 }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 10, minWidth: 'max-content', width: '100%' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 2, background: '#18181b' }}>
            {/* Row 1: group title headers */}
            <tr>
              <th rowSpan={3} style={{ ...GH, textAlign: 'left', background: '#27272a', color: '#a1a1aa', borderBottom: HB, padding: '8px 12px', verticalAlign: 'bottom', width: 180, maxWidth: 180, position: 'sticky', left: 0, zIndex: 3 }}>Keyword</th>
              <th rowSpan={3} style={{ ...GH, background: BG.sqp, color: FG.sqp, borderLeft: WB, borderBottom: HB, verticalAlign: 'bottom', fontSize: 11 }}>Search vol</th>
              {S1_KPIS.map(kpi => (
                <th key={kpi.k} colSpan={1 + (exp[kpi.k] ? 2 : 0)} style={{ ...GH, background: BG.sqp, color: FG.sqp, borderLeft: WB, fontSize: 12, paddingBottom: 2 }}>
                  {kpi.hdr}
                </th>
              ))}
              {/* ADS group header — no borderBottom so it matches the SQP group height */}
              <th colSpan={8} style={{ ...GH, background: BG.ads, color: FG.ads, borderLeft: WB, fontSize: 12 }}>Ads data — {periodLabel}</th>
              <th rowSpan={3} style={{ ...GH, background: '#27272a', borderBottom: HB }} />
            </tr>
            {/* Row 2: expand buttons + ADS spacer (same visual row) */}
            <tr>
              {S1_KPIS.map(kpi => (
                <th key={kpi.k} colSpan={1 + (exp[kpi.k] ? 2 : 0)} style={{ ...GH, background: BG.sqp, borderLeft: WB, paddingTop: 2, paddingBottom: 3, textAlign: 'center' }}>
                  <button style={EB} onClick={() => toggleExp(kpi.k)}>{exp[kpi.k] ? '− collapse' : '+ expand'}</button>
                </th>
              ))}
              {/* Spacer: keeps row height; ADS column names will appear in row 3 */}
              <th colSpan={8} style={{ background: BG.ads, borderLeft: WB, padding: '4px 8px' }} />
            </tr>
            {/* Row 3: SQP "Share" + ADS column names — now aligned! */}
            <tr>
              {S1_KPIS.map(kpi => (
                <React.Fragment key={kpi.k}>
                  <th style={{ ...SH2, background: BG.sqp, borderLeft: WB, color: '#fff', fontSize: 11 }}>Share</th>
                  {exp[kpi.k] && <>
                    <th style={{ ...SH2, background: BG.sqp, color: '#facc15', fontSize: 11 }}>Ours</th>
                    <th style={{ ...SH2, background: BG.sqp, color: '#e4e4e7', fontSize: 11 }}>Market</th>
                  </>}
                </React.Fragment>
              ))}
              <th style={{ ...SH2, background: BG.ads, borderLeft: WB, fontSize: 11 }}>Impressions</th>
              <th style={{ ...SH2, background: BG.ads, fontSize: 11 }}>Clicks</th>
              <th style={{ ...SH2, background: BG.ads, fontSize: 11 }}>CTR%</th>
              <th style={{ ...SH2, background: BG.ads, fontSize: 11 }}>Orders</th>
              <th style={{ ...SH2, background: BG.ads, fontSize: 11 }}>CVR%</th>
              <th style={{ ...SH2, background: BG.ads, fontSize: 11 }}>Spend</th>
              <th style={{ ...SH2, background: BG.ads, fontSize: 11 }}>Sales</th>
              <th style={{ ...SH2, background: BG.ads, fontSize: 11 }}>ACoS%</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(row => {
              const prevAdsCtr  = (row.prevAdsImp != null && row.prevAdsImp > 0 && row.prevAdsClk != null)
                ? (row.prevAdsClk / row.prevAdsImp) * 100 : null;
              const prevAdsCvr  = (row.prevAdsClk != null && row.prevAdsClk > 0 && row.prevAdsOrders != null)
                ? (row.prevAdsOrders / row.prevAdsClk) * 100 : null;
              const prevAdsAcos = (row.prevAdsSales != null && row.prevAdsSales > 0 && row.prevAdsSpend != null)
                ? (row.prevAdsSpend / row.prevAdsSales) * 100 : null;
              return (
                <tr key={row.searchTerm}
                  onMouseEnter={e => (e.currentTarget.style.background = '#27272a')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ ...TD, textAlign: 'left', verticalAlign: 'middle', width: 180, maxWidth: 180, position: 'sticky', left: 0, zIndex: 1, background: '#27272a' }}>
                    <div
                      style={{ fontSize: 11, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160, cursor: 'default' }}
                      onMouseEnter={e => { const r = (e.target as HTMLElement).getBoundingClientRect(); setTooltip({ text: row.searchTerm, x: r.left, y: r.top }); }}
                      onMouseLeave={() => setTooltip(null)}
                      title={row.searchTerm}
                    >{row.searchTerm}</div>
                    <span style={{ fontSize: 8, fontWeight: 700, background: '#14532d', color: '#4ade80', borderRadius: 2, padding: '1px 4px', marginTop: 2, display: 'inline-block' }}>branded</span>
                  </td>
                  <td style={{ ...TD, borderLeft: WB }}>
                    <div style={{ fontWeight: 700, color: '#e4e4e7' }}>{fmtK(row.searchVolume)}</div>
                    <Delta d={wowPct(row.searchVolume, row.prevSearchVolume)} />
                  </td>
                  {S1_KPIS.map(kpi => {
                    const share     = row[kpi.shareKey]     as number;
                    const prevShare = row[kpi.prevShareKey] as number|null;
                    const mktVal    = row[kpi.mktKey]       as number;
                    const ourVal    = row[kpi.ourKey]        as number;
                    const prevMkt   = row[kpi.prevMktKey]   as number|null;
                    const prevOur   = row[kpi.prevOurKey]   as number|null;
                    const fmtVal    = kpi.isCcy ? fmtCcy : fmtK;
                    return (
                      <React.Fragment key={kpi.k}>
                        <td style={{ ...TD }}>
                          <div style={{ fontWeight: 700, color: kpi.k === 'pur' ? '#facc15' : '#fff' }}>{pctFmt(share, 1)}</div>
                          <Delta d={wowPct(share, prevShare)} />
                        </td>
                        {exp[kpi.k] && <>
                          <td key={`${kpi.k}-our`} style={{ ...TD, background: BG.sqp + '44' }}>
                            <div style={{ fontWeight: 700, color: '#facc15' }}>{fmtVal(ourVal)}</div>
                            <Delta d={wowPct(ourVal, prevOur)} />
                          </td>
                          <td key={`${kpi.k}-mkt`} style={{ ...TD, background: BG.sqp + '44' }}>
                            <div style={{ color: '#e4e4e7' }}>{fmtVal(mktVal)}</div>
                            <Delta d={wowPct(mktVal, prevMkt)} />
                          </td>
                        </>}
                      </React.Fragment>
                    );
                  })}
                  {row.adsImp !== null ? <>
                    <td style={{ ...TD, borderLeft: WB }}><div style={{ fontWeight: 700, color: '#e4e4e7' }}>{fmtK(row.adsImp)}</div><Delta d={wowPct(row.adsImp, row.prevAdsImp)} /></td>
                    <td style={{ ...TD }}><div style={{ color: '#e4e4e7' }}>{fmtK(row.adsClk ?? 0)}</div><Delta d={wowPct(row.adsClk ?? 0, row.prevAdsClk)} /></td>
                    <td style={{ ...TD }}><div style={{ color: '#e4e4e7' }}>{row.adsCtr != null ? pctFmt(row.adsCtr, 2) : '—'}</div>{row.adsCtr != null && <Delta d={wowPct(row.adsCtr, prevAdsCtr)} />}</td>
                    <td style={{ ...TD }}><div style={{ color: '#e4e4e7' }}>{fmtK(row.adsOrders ?? 0)}</div><Delta d={wowPct(row.adsOrders ?? 0, row.prevAdsOrders)} /></td>
                    <td style={{ ...TD }}><div style={{ color: '#e4e4e7' }}>{row.adsCvr != null ? pctFmt(row.adsCvr, 2) : '—'}</div>{row.adsCvr != null && <Delta d={wowPct(row.adsCvr, prevAdsCvr)} />}</td>
                    <td style={{ ...TD }}><div style={{ color: '#facc15', fontWeight: 700 }}>{fmtCcy(row.adsSpend ?? 0)}</div><Delta d={wowPct(row.adsSpend ?? 0, row.prevAdsSpend)} /></td>
                    <td style={{ ...TD }}><div style={{ color: '#e4e4e7' }}>{fmtCcy(row.adsSales ?? 0)}</div><Delta d={wowPct(row.adsSales ?? 0, row.prevAdsSales)} /></td>
                    <td style={{ ...TD }}><div style={{ color: row.adsAcos != null && row.adsAcos < 25 ? '#4ade80' : '#f87171', fontWeight: 700 }}>{row.adsAcos != null ? pctFmt(row.adsAcos, 2) : '—'}</div>{row.adsAcos != null && <Delta d={wowPct(row.adsAcos, prevAdsAcos)} />}</td>
                  </> : <td colSpan={8} style={{ ...TD, borderLeft: WB, color: '#52525b', textAlign: 'center' }}>—</td>}
                  <td style={{ ...TD, verticalAlign: 'middle' }}>
                    <button onClick={() => onShowData(row.searchTerm)} style={{ background: 'transparent', border: '0.5px solid #52525b', color: '#f97316', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3, cursor: 'pointer', whiteSpace: 'nowrap' }}>Show data</button>
                  </td>
                </tr>
              );
            })}
            {/* Totals row */}
            {filtered.length > 0 && (
              <tr style={{ background: TOTBG, borderTop: TOTBDR }}>
                <td style={{ ...TOT, textAlign: 'left', fontWeight: 700, color: '#f97316', fontSize: 10, borderTop: TOTBDR, position: 'sticky', left: 0, zIndex: 1, background: TOTBG }}>TOTALS</td>
                <td style={{ ...TOT, borderLeft: WB, borderTop: TOTBDR }}>
                  <div style={{ fontWeight: 700, color: '#e4e4e7' }}>{fmtK(totSV)}</div>
                </td>
                {S1_KPIS.map((kpi, i) => {
                  const fmtVal = kpi.isCcy ? fmtCcy : fmtK;
                  return (
                    <React.Fragment key={kpi.k}>
                      <td style={{ ...TOT, borderTop: TOTBDR }}>
                        <div style={{ fontWeight: 700, color: kpi.k === 'pur' ? '#facc15' : '#fff' }}>{pctFmt(totShares[i], 1)}</div>
                      </td>
                      {exp[kpi.k] && <>
                        <td style={{ ...TOT, borderTop: TOTBDR }}><div style={{ fontWeight: 700, color: '#facc15' }}>{fmtVal(totOurs[i])}</div></td>
                        <td style={{ ...TOT, borderTop: TOTBDR }}><div style={{ color: '#e4e4e7' }}>{fmtVal(totMkts[i])}</div></td>
                      </>}
                    </React.Fragment>
                  );
                })}
                {adsRows.length > 0 ? <>
                  <td style={{ ...TOT, borderLeft: WB, borderTop: TOTBDR }}><div style={{ fontWeight: 700, color: '#e4e4e7' }}>{fmtK(totAdsImp)}</div></td>
                  <td style={{ ...TOT, borderTop: TOTBDR }}><div style={{ color: '#e4e4e7' }}>{fmtK(totAdsClk)}</div></td>
                  <td style={{ ...TOT, borderTop: TOTBDR }}><div style={{ color: '#e4e4e7' }}>{pctFmt(totAdsCtr, 2)}</div></td>
                  <td style={{ ...TOT, borderTop: TOTBDR }}><div style={{ color: '#e4e4e7' }}>{fmtK(totAdsOrd)}</div></td>
                  <td style={{ ...TOT, borderTop: TOTBDR }}><div style={{ color: '#e4e4e7' }}>{pctFmt(totAdsCvr, 2)}</div></td>
                  <td style={{ ...TOT, borderTop: TOTBDR }}><div style={{ color: '#facc15', fontWeight: 700 }}>{fmtCcy(totAdsSpend)}</div></td>
                  <td style={{ ...TOT, borderTop: TOTBDR }}><div style={{ color: '#e4e4e7' }}>{fmtCcy(totAdsSales)}</div></td>
                  <td style={{ ...TOT, borderTop: TOTBDR }}><div style={{ color: totAdsAcos != null && totAdsAcos < 25 ? '#4ade80' : '#f87171', fontWeight: 700 }}>{totAdsAcos != null ? pctFmt(totAdsAcos, 2) : '—'}</div></td>
                </> : <td colSpan={8} style={{ ...TOT, borderLeft: WB, borderTop: TOTBDR, color: '#52525b', textAlign: 'center' }}>—</td>}
                <td style={{ ...TOT, borderTop: TOTBDR }} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 border-t border-zinc-700 bg-zinc-800/50">
        <span className="text-xs text-zinc-400">{filtered.length} branded terms — scroll to see all</span>
      </div>
    </div>
  );
}

// ─── SECTION 2 ────────────────────────────────────────────────────────────────
const S2_KPIS = [
  { k:'imp',  hdr:'Impressions', bg:BG.imp,  fg:FG.imp  },
  { k:'clk',  hdr:'Clicks',      bg:BG.clk,  fg:FG.clk  },
  { k:'cart', hdr:'Cart Adds',   bg:BG.cart, fg:FG.cart },
  { k:'pur',  hdr:'Purchases',   bg:BG.pur,  fg:FG.pur  },
  { k:'rev',  hdr:'Revenue',     bg:BG.rev,  fg:FG.rev  },
] as const;

function Section2({ rows, isMonthly }: { rows: PeriodRow[]; isMonthly: boolean }) {
  const [exp, setExp]         = useState<Record<string,boolean>>({});
  const [rowLimit, setRowLimit] = useState(10);
  const shown = rows.slice(0, rowLimit);
  const toggleExp = (k: string) => setExp(prev => ({ ...prev, [k]: !prev[k] }));

  // Totals: avg shares, sum counts (when expanded)
  const totals = S2_KPIS.map(kpi => {
    const kpiK = kpi.k;
    const cap  = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    const n    = shown.length || 1;
    return {
      nbShare: shown.reduce((s, r) => s + (r.nb[`${kpiK}Share` as keyof ShareBucket] as number), 0) / n,
      brShare: shown.reduce((s, r) => s + (r.br[`${kpiK}Share` as keyof ShareBucket] as number), 0) / n,
      nbOur:   shown.reduce((s, r) => s + (r.nb[`our${cap(kpiK)}` as keyof ShareBucket] as number), 0),
      nbMkt:   shown.reduce((s, r) => s + (r.nb[`mkt${cap(kpiK)}` as keyof ShareBucket] as number), 0),
      brOur:   shown.reduce((s, r) => s + (r.br[`our${cap(kpiK)}` as keyof ShareBucket] as number), 0),
      brMkt:   shown.reduce((s, r) => s + (r.br[`mkt${cap(kpiK)}` as keyof ShareBucket] as number), 0),
    };
  });

  return (
    <div className="mb-4 bg-zinc-800 border border-zinc-700 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white">Branded & non-branded vs market</span>
            <span style={{ fontSize: 9, fontWeight: 700, background: '#1e3a5f', color: '#60a5fa', borderRadius: 3, padding: '1px 6px' }}>vs market</span>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">Share % by branded / non-branded · Expand to see counts · Always latest 10 {isMonthly ? 'months' : 'weeks'}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400">Show</span>
          <select value={rowLimit} onChange={e => setRowLimit(Number(e.target.value))} className="bg-zinc-700 border border-zinc-600 text-white text-xs rounded px-2 py-1">
            <option value={10}>10</option><option value={15}>15</option><option value={20}>20</option>
          </select>
          <span className="text-xs text-zinc-400">{isMonthly ? 'months' : 'weeks'}</span>
        </div>
      </div>
      <div style={{ height: 520, overflowY: 'auto', overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 10, minWidth: 'max-content', width: '100%' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 2, background: '#18181b' }}>
            <tr>
              <th rowSpan={3} style={{ ...GH, textAlign: 'left', background: '#27272a', color: '#a1a1aa', borderBottom: HB, padding: '8px 12px', verticalAlign: 'bottom', whiteSpace: 'nowrap', fontSize: 12, position: 'sticky', left: 0, zIndex: 3 }}>{isMonthly ? 'Month' : 'Week'}</th>
              {S2_KPIS.map(kpi => {
                const nbEx = exp[kpi.k+'_nb'], brEx = exp[kpi.k+'_br'];
                const span = 2 + (nbEx ? 2 : 0) + (brEx ? 2 : 0);
                return <th key={kpi.k} colSpan={span} style={{ ...GH, background: kpi.bg, color: kpi.fg, borderLeft: WB, fontSize: 12 }}>{kpi.hdr}</th>;
              })}
            </tr>
            <tr>
              {S2_KPIS.map(kpi => {
                const nbEx = exp[kpi.k+'_nb'], brEx = exp[kpi.k+'_br'];
                return (
                  <React.Fragment key={kpi.k}>
                    {/* Centered: flex column with label + button */}
                    <th colSpan={1+(nbEx?2:0)} style={{ ...GH, background: kpi.bg, borderLeft: WB, paddingTop: 2, paddingBottom: 3 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                        <span style={{ color: '#a78bfa', fontSize: 10 }}>Non-branded</span>
                        <button style={EB} onClick={() => toggleExp(kpi.k+'_nb')}>{nbEx ? '− collapse' : '+ expand'}</button>
                      </div>
                    </th>
                    <th colSpan={1+(brEx?2:0)} style={{ ...GH, background: kpi.bg, paddingTop: 2, paddingBottom: 3 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                        <span style={{ color: '#6ee7b7', fontSize: 10 }}>Branded</span>
                        <button style={EB} onClick={() => toggleExp(kpi.k+'_br')}>{brEx ? '− collapse' : '+ expand'}</button>
                      </div>
                    </th>
                  </React.Fragment>
                );
              })}
            </tr>
            <tr>
              {S2_KPIS.map(kpi => {
                const nbEx = exp[kpi.k+'_nb'], brEx = exp[kpi.k+'_br'];
                return (
                  <React.Fragment key={kpi.k}>
                    <th style={{ ...SH2, background: kpi.bg, borderLeft: WB, color: '#a78bfa', fontSize: 11 }}>Share</th>
                    {nbEx && <>
                      <th style={{ ...SH2, background: kpi.bg, color: '#facc15', fontSize: 11 }}>Ours</th>
                      <th style={{ ...SH2, background: kpi.bg, color: '#e4e4e7', fontSize: 11 }}>Market</th>
                    </>}
                    <th style={{ ...SH2, background: kpi.bg, color: '#6ee7b7', fontSize: 11 }}>Share</th>
                    {brEx && <>
                      <th style={{ ...SH2, background: kpi.bg, color: '#facc15', fontSize: 11 }}>Ours</th>
                      <th style={{ ...SH2, background: kpi.bg, color: '#e4e4e7', fontSize: 11 }}>Market</th>
                    </>}
                  </React.Fragment>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {shown.map((row, idx, arr) => {
              const prev = arr[idx + 1] ?? null;
              const label = isMonthly ? `${row.periodNumber}/${row.year}` : `W${row.periodNumber}/${row.year}`;
              return (
                <tr key={row.dateKey}
                  onMouseEnter={e => (e.currentTarget.style.background = '#27272a')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ ...TD, textAlign:'left', fontWeight:700, color:'#fff', whiteSpace:'nowrap', position:'sticky', left:0, zIndex:1, background:'#27272a' }}>{label}</td>
                  {S2_KPIS.map(kpi => {
                    const nbEx = exp[kpi.k+'_nb'], brEx = exp[kpi.k+'_br'];
                    const kpiK = kpi.k;
                    const cap  = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
                    const nbShare  = row.nb[`${kpiK}Share` as keyof ShareBucket] as number;
                    const brShare  = row.br[`${kpiK}Share` as keyof ShareBucket] as number;
                    const nbOur    = row.nb[`our${cap(kpiK)}` as keyof ShareBucket] as number;
                    const nbMkt    = row.nb[`mkt${cap(kpiK)}` as keyof ShareBucket] as number;
                    const brOur    = row.br[`our${cap(kpiK)}` as keyof ShareBucket] as number;
                    const brMkt    = row.br[`mkt${cap(kpiK)}` as keyof ShareBucket] as number;
                    const prevNbSh = prev ? prev.nb[`${kpiK}Share` as keyof ShareBucket] as number : null;
                    const prevBrSh = prev ? prev.br[`${kpiK}Share` as keyof ShareBucket] as number : null;
                    const fmtVal   = kpiK === 'rev' ? fmtCcy : fmtK;
                    return (
                      <React.Fragment key={kpi.k}>
                        <td style={{ ...TD, borderLeft: WB }}>
                          <div style={{ fontWeight:700, color:'#a78bfa' }}>{pctFmt(nbShare)}</div>
                          {/* pct-only delta */}
                          <Delta d={wowPct(nbShare, prevNbSh)} />
                        </td>
                        {nbEx && <>
                          <td style={{ ...TD }}><div style={{ color:'#facc15', fontWeight:700 }}>{fmtVal(nbOur)}</div></td>
                          <td style={{ ...TD }}><div style={{ color:'#e4e4e7' }}>{fmtVal(nbMkt)}</div></td>
                        </>}
                        <td style={{ ...TD }}>
                          <div style={{ fontWeight:700, color:'#6ee7b7' }}>{pctFmt(brShare)}</div>
                          {/* pct-only delta */}
                          <Delta d={wowPct(brShare, prevBrSh)} />
                        </td>
                        {brEx && <>
                          <td style={{ ...TD }}><div style={{ color:'#facc15', fontWeight:700 }}>{fmtVal(brOur)}</div></td>
                          <td style={{ ...TD }}><div style={{ color:'#e4e4e7' }}>{fmtVal(brMkt)}</div></td>
                        </>}
                      </React.Fragment>
                    );
                  })}
                </tr>
              );
            })}
            {/* Totals row — avg shares, sum counts */}
            {shown.length > 0 && (
              <tr style={{ background: TOTBG }}>
                <td style={{ ...TOT, textAlign: 'left', fontWeight: 700, color: '#f97316', fontSize: 10, borderTop: TOTBDR, position: 'sticky', left: 0, zIndex: 1, background: TOTBG }}>AVG / TOT</td>
                {S2_KPIS.map((kpi, i) => {
                  const nbEx = exp[kpi.k+'_nb'], brEx = exp[kpi.k+'_br'];
                  const tot  = totals[i];
                  const fmtVal = kpi.k === 'rev' ? fmtCcy : fmtK;
                  return (
                    <React.Fragment key={kpi.k}>
                      <td style={{ ...TOT, borderLeft: WB, borderTop: TOTBDR }}>
                        <div style={{ fontWeight:700, color:'#a78bfa' }}>{pctFmt(tot.nbShare)}</div>
                      </td>
                      {nbEx && <>
                        <td style={{ ...TOT, borderTop: TOTBDR }}><div style={{ color:'#facc15', fontWeight:700 }}>{fmtVal(tot.nbOur)}</div></td>
                        <td style={{ ...TOT, borderTop: TOTBDR }}><div style={{ color:'#e4e4e7' }}>{fmtVal(tot.nbMkt)}</div></td>
                      </>}
                      <td style={{ ...TOT, borderTop: TOTBDR }}>
                        <div style={{ fontWeight:700, color:'#6ee7b7' }}>{pctFmt(tot.brShare)}</div>
                      </td>
                      {brEx && <>
                        <td style={{ ...TOT, borderTop: TOTBDR }}><div style={{ color:'#facc15', fontWeight:700 }}>{fmtVal(tot.brOur)}</div></td>
                        <td style={{ ...TOT, borderTop: TOTBDR }}><div style={{ color:'#e4e4e7' }}>{fmtVal(tot.brMkt)}</div></td>
                      </>}
                    </React.Fragment>
                  );
                })}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── SECTION 3 ────────────────────────────────────────────────────────────────
const S3_KPIS = [
  { k:'imp',  hdr:'Impressions', bg:BG.imp,  fg:FG.imp,  nbKey:'nbImp'   as keyof S3Bucket, brKey:'brImp'   as keyof S3Bucket, isCcy:false, three:true },
  { k:'clk',  hdr:'Clicks',      bg:BG.clk,  fg:FG.clk,  nbKey:'nbClk'   as keyof S3Bucket, brKey:'brClk'   as keyof S3Bucket, isCcy:false, three:true },
  { k:'cart', hdr:'Cart Adds',   bg:BG.cart, fg:FG.cart, nbKey:'nbCart'  as keyof S3Bucket, brKey:'brCart'  as keyof S3Bucket, isCcy:false, three:true },
  { k:'pur',  hdr:'Purchases',   bg:BG.pur,  fg:FG.pur,  nbKey:'nbPur'   as keyof S3Bucket, brKey:'brPur'   as keyof S3Bucket, isCcy:false, three:true },
  { k:'rev',  hdr:'Revenue',     bg:BG.rev,  fg:FG.rev,  nbKey:'nbRev'   as keyof S3Bucket, brKey:'brRev'   as keyof S3Bucket, isCcy:true,  three:true },
  { k:'spd',  hdr:'Spend',       bg:BG.spd,  fg:FG.spd,  nbKey:'nbSpend' as keyof S3Bucket, brKey:'brSpend' as keyof S3Bucket, isCcy:true,  three:true },
  { k:'sls',  hdr:'Sales',       bg:BG.sls,  fg:FG.sls,  nbKey:'nbSales' as keyof S3Bucket, brKey:'brSales' as keyof S3Bucket, isCcy:true,  three:true },
  { k:'acs',  hdr:'ACoS%',       bg:BG.acs,  fg:FG.acs,  nbKey:'nbAcos'  as keyof S3Bucket, brKey:'brAcos'  as keyof S3Bucket, isCcy:false, three:false },
] as const;

function Section3({ rows, isMonthly }: { rows: PeriodRow[]; isMonthly: boolean }) {
  const [rowLimit, setRowLimit] = useState(10);
  const shown = rows.slice(0, rowLimit);

  // Totals: sum nb/br, compute % branded from sums; ACoS from spend/sales
  const totNbSpend = shown.reduce((s, r) => s + r.s3.nbSpend, 0);
  const totBrSpend = shown.reduce((s, r) => s + r.s3.brSpend, 0);
  const totNbSales = shown.reduce((s, r) => s + r.s3.nbSales, 0);
  const totBrSales = shown.reduce((s, r) => s + r.s3.brSales, 0);
  const totNbAcos  = totNbSales > 0 ? (totNbSpend / totNbSales) * 100 : 0;
  const totBrAcos  = totBrSales > 0 ? (totBrSpend / totBrSales) * 100 : 0;
  const s3Totals = S3_KPIS.map(kpi => {
    if (kpi.k === 'acs') return { nbSum: totNbAcos, brSum: totBrAcos, pct: 0 };
    const nbSum = shown.reduce((s, r) => s + (r.s3[kpi.nbKey] as number), 0);
    const brSum = shown.reduce((s, r) => s + (r.s3[kpi.brKey] as number), 0);
    const tot   = nbSum + brSum;
    return { nbSum, brSum, pct: tot > 0 ? (brSum / tot) * 100 : 0 };
  });

  return (
    <div className="mb-4 bg-zinc-800 border border-zinc-700 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white">Branded vs non-branded</span>
            <span style={{ fontSize: 9, fontWeight: 700, background: '#1e1b2e', color: '#a78bfa', borderRadius: 3, padding: '1px 6px' }}>Our data only</span>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">Internal split: branded vs non-branded contribution · Always latest 10 {isMonthly ? 'months' : 'weeks'}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400">Show</span>
          <select value={rowLimit} onChange={e => setRowLimit(Number(e.target.value))} className="bg-zinc-700 border border-zinc-600 text-white text-xs rounded px-2 py-1">
            <option value={10}>10</option><option value={15}>15</option><option value={20}>20</option>
          </select>
          <span className="text-xs text-zinc-400">{isMonthly ? 'months' : 'weeks'}</span>
        </div>
      </div>
      <div style={{ height: 520, overflowY: 'auto', overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 10, minWidth: 'max-content', width: '100%' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 2, background: '#18181b' }}>
            <tr>
              <th rowSpan={2} style={{ ...GH, textAlign:'left', background:'#27272a', color:'#a1a1aa', borderBottom:HB, padding:'8px 12px', verticalAlign:'bottom', whiteSpace:'nowrap', fontSize: 12, position:'sticky', left:0, zIndex:3 }}>{isMonthly ? 'Month' : 'Week'}</th>
              {S3_KPIS.map(kpi => (
                <th key={kpi.k} colSpan={kpi.three ? 3 : 2} style={{ ...GH, background:kpi.bg, color:kpi.fg, borderLeft:WB, borderBottom:HB, fontSize: 12 }}>{kpi.hdr}</th>
              ))}
            </tr>
            <tr>
              {S3_KPIS.map(kpi => (
                <React.Fragment key={kpi.k}>
                  <th style={{ ...SH2, background:kpi.bg, borderLeft:WB, fontSize: 11 }}><span style={{ color:'#a78bfa' }}>Non-branded</span></th>
                  <th style={{ ...SH2, background:kpi.bg, fontSize: 11 }}><span style={{ color:'#6ee7b7' }}>Branded</span></th>
                  {kpi.three && <th style={{ ...SH2, background:kpi.bg, fontSize: 11 }}><span style={{ color:'#fbbf24' }}>% branded</span></th>}
                </React.Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row, idx, arr) => {
              const prev = arr[idx+1] ?? null;
              const label = isMonthly ? `${row.periodNumber}/${row.year}` : `W${row.periodNumber}/${row.year}`;
              return (
                <tr key={row.dateKey}
                  onMouseEnter={e => (e.currentTarget.style.background = '#27272a')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ ...TD, textAlign:'left', fontWeight:700, color:'#fff', whiteSpace:'nowrap', position:'sticky', left:0, zIndex:1, background:'#27272a' }}>{label}</td>
                  {S3_KPIS.map(kpi => {
                    const nbVal   = row.s3[kpi.nbKey] as number;
                    const brVal   = row.s3[kpi.brKey] as number;
                    const total   = nbVal + brVal;
                    const pct     = total > 0 ? (brVal / total) * 100 : 0;
                    const prevNb  = prev ? prev.s3[kpi.nbKey] as number : null;
                    const prevBr  = prev ? prev.s3[kpi.brKey] as number : null;
                    const prevTot = prevNb !== null && prevBr !== null ? prevNb + prevBr : null;
                    const prevPct = prevTot && prevTot > 0 && prevBr !== null ? (prevBr / prevTot) * 100 : null;
                    const fmt     = kpi.isCcy ? fmtCcy : kpi.k === 'acs' ? (v: number) => pctFmt(v, 2) : fmtK;
                    return (
                      <React.Fragment key={kpi.k}>
                        <td style={{ ...TD, borderLeft:WB }}>
                          <div style={{ color:'#a78bfa', fontWeight:700 }}>{fmt(nbVal)}</div>
                          <Delta d={wowPct(nbVal, prevNb)} />
                        </td>
                        <td style={{ ...TD }}>
                          <div style={{ color:'#6ee7b7', fontWeight:700 }}>{fmt(brVal)}</div>
                          <Delta d={wowPct(brVal, prevBr)} />
                        </td>
                        {kpi.three && (
                          <td style={{ ...TD }}>
                            <div style={{ color:'#fbbf24', fontWeight:700 }}>{pctFmt(pct)}</div>
                            {/* pct-only delta for % branded */}
                            <Delta d={wowPct(pct, prevPct)} />
                          </td>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tr>
              );
            })}
            {/* Totals row */}
            {shown.length > 0 && (
              <tr style={{ background: TOTBG }}>
                <td style={{ ...TOT, textAlign: 'left', fontWeight: 700, color: '#f97316', fontSize: 10, borderTop: TOTBDR, position: 'sticky', left: 0, zIndex: 1, background: TOTBG }}>TOTALS</td>
                {S3_KPIS.map((kpi, i) => {
                  const t = s3Totals[i];
                  const isAcs  = kpi.k === 'acs';
                  const nbDisp = isAcs ? pctFmt(t.nbSum, 2) : kpi.isCcy ? fmtCcy(t.nbSum) : fmtK(t.nbSum);
                  const brDisp = isAcs ? pctFmt(t.brSum, 2) : kpi.isCcy ? fmtCcy(t.brSum) : fmtK(t.brSum);
                  return (
                    <React.Fragment key={kpi.k}>
                      <td style={{ ...TOT, borderLeft: WB, borderTop: TOTBDR }}>
                        <div style={{ color: '#a78bfa', fontWeight: 700 }}>{nbDisp}</div>
                      </td>
                      <td style={{ ...TOT, borderTop: TOTBDR }}>
                        <div style={{ color: '#6ee7b7', fontWeight: 700 }}>{brDisp}</div>
                      </td>
                      {kpi.three && (
                        <td style={{ ...TOT, borderTop: TOTBDR }}>
                          <div style={{ color: '#fbbf24', fontWeight: 700 }}>{pctFmt(t.pct)}</div>
                        </td>
                      )}
                    </React.Fragment>
                  );
                })}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function BrandedPage() {
  const [mode, setMode] = useState<'weekly'|'monthly'>('weekly');
  const isMonthly = mode === 'monthly';

  const [brandOpts,   setBrandOpts]   = useState<Opt[]>([]);
  const [familyOpts,  setFamilyOpts]  = useState<Opt[]>([]);
  const [selBrand,    setSelBrand]    = useState('');
  const [selFamilies, setSelFamilies] = useState<string[]>([]);

  const [section1,     setSection1]     = useState<S1Row[]>([]);
  const [section2,     setSection2]     = useState<PeriodRow[]>([]);
  const [section3,     setSection3]     = useState<PeriodRow[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [showDataTerm, setShowDataTerm] = useState<string|null>(null);

  // Load brands
  useEffect(() => {
    fetch('/api/dashboard/filters?type=brands').then(r => r.json()).then(d => {
      const opts = (d.brands ?? []).map((b: string) => ({ value: b, label: b }));
      setBrandOpts(opts);
    });
  }, []);

  // On mount: get best brand+family from DB, then load data
  useEffect(() => {
    async function init() {
      try {
        const dr = await fetch('/api/dashboard/branded', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'defaults', mode: 'weekly' }),
        });
        const d = await dr.json();
        const brand  = d.bestBrand  ?? '';
        const family = d.bestFamily ?? '';

        if (brand)  setSelBrand(brand);
        if (family) setSelFamilies([family]);

        if (brand) {
          fetch(`/api/dashboard/filters?type=families&brands=${brand}`)
            .then(r => r.json()).then(fd => {
              const opts = (fd.families ?? []).map((f: { family_name: string }) => ({ value: f.family_name, label: f.family_name }));
              setFamilyOpts(opts);
            });
        }

        if (brand) {
          const res = await fetch('/api/dashboard/branded', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            // No startDate/endDate — API uses latest available date automatically
            body: JSON.stringify({ brand, families: family ? [family] : [], mode: 'weekly' }),
          });
          const data = await res.json();
          setSection1(data.section1 ?? []);
          setSection2(data.section2 ?? []);
          setSection3(data.section3 ?? []);
        }
      } catch (e) {
        console.error('[branded] init error:', e);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load families when brand changes
  useEffect(() => {
    if (!selBrand) return;
    fetch(`/api/dashboard/filters?type=families&brands=${selBrand}`).then(r => r.json()).then(d => {
      const opts = (d.families ?? []).map((f: { family_name: string }) => ({ value: f.family_name, label: f.family_name }));
      setFamilyOpts(opts);
    });
  }, [selBrand]);

  const fetchData = useCallback(async (modeOverride?: 'weekly'|'monthly') => {
    if (!selBrand) return;
    const fetchMode = modeOverride ?? mode;
    setLoading(true);
    try {
      const res = await fetch('/api/dashboard/branded', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand: selBrand, families: selFamilies, mode: fetchMode }),
      });
      const d = await res.json();
      setSection1(d.section1 ?? []);
      setSection2(d.section2 ?? []);
      setSection3(d.section3 ?? []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [selBrand, selFamilies, mode]);

  return (
    // overflow-x-hidden: prevents page-level horizontal scroll; each section handles its own
    <div className="min-h-screen bg-zinc-900 text-white">
      <div className="border-b border-zinc-800 px-8 py-5">
        <h1 className="text-xl font-bold text-white">Branded vs Non-Branded</h1>
        <p className="text-sm text-zinc-300 mt-1">Defensive vs offensive keyword split · SQP + Ads data</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-zinc-700 px-8">
        <div className="flex">
          {([['weekly','Week over Week'],['monthly','Month over Month']] as const).map(([val,label]) => (
            <button key={val} onClick={() => { if (val !== mode) { setMode(val); fetchData(val); } }}
              className={`py-4 px-6 text-sm font-semibold border-b-2 transition-colors ${mode === val ? 'border-orange-400 text-orange-400' : 'border-transparent text-zinc-300 hover:text-white'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Filter bar — Brand + Family only (no date pickers) */}
      <div className="bg-zinc-800 border-b border-zinc-700 px-8 py-4">
        <div className="flex flex-wrap items-end gap-4">
          <BrandSelect opts={brandOpts} value={selBrand} onChange={v => { setSelBrand(v); setSelFamilies([]); }} />
          <MultiSel opts={familyOpts} value={selFamilies} onChange={setSelFamilies} placeholder="All families" disabled={!selBrand} label="Family" />
          <button onClick={() => fetchData()} disabled={loading || !selBrand}
            className="px-4 py-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white rounded text-sm font-bold self-end">
            {loading ? 'Loading…' : 'Apply'}
          </button>
          {loading && <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin self-end mb-1" />}
        </div>
      </div>

      {/* Content */}
      <div className="px-8 py-6">
        {!selBrand && !loading && <div className="py-20 text-center text-zinc-400">Loading best brand…</div>}
        {loading && !section1.length && (
          <div className="flex items-center justify-center py-20 gap-3">
            <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-zinc-300">Loading branded data…</p>
          </div>
        )}
        {selBrand && <>
          <Section1 rows={section1} isMonthly={isMonthly} onShowData={setShowDataTerm} />
          <Section2 rows={section2} isMonthly={isMonthly} />
          <Section3 rows={section3} isMonthly={isMonthly} />
        </>}
      </div>

      {showDataTerm && (
        <ShowDataModal
          term={showDataTerm}
          brand={selBrand}
          families={selFamilies}
          mode={mode}
          onClose={() => setShowDataTerm(null)}
        />
      )}
    </div>
  );
}
