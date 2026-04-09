'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Legend, ResponsiveContainer, Tooltip,
} from 'recharts';
import { useFilters } from '../filter-context';

// ─── TYPES ────────────────────────────────────────────────────────────────────
type KwMode = 'non-branded' | 'both' | 'branded';
type FilterOption = { value: string; label: string };

interface PeriodResult {
  year: number; searchVolume: number;
  ourImpressions: number; marketImpressions: number; impressionShare: number;
  ourClicks: number; marketClicks: number; clickShare: number;
  ourCartAdds: number; marketCartAdds: number; cartAddShare: number;
  ourPurchases: number; marketPurchases: number; purchaseShare: number;
  ourClickPrice: number | null; marketClickPrice: number | null;
  ourCartPrice: number | null; marketCartPrice: number | null;
  ourPurchasePrice: number | null; marketPurchasePrice: number | null;
}

interface YoYRow { periodNumber: number; ty: PeriodResult | null; ly: PeriodResult | null; }

interface ChartRow {
  label: string; periodNumber: number; isFutureTY: boolean;
  ty_sv: number | null; ly_sv: number;
  ty_impShare: number | null; ly_impShare: number;
  ty_clkShare: number | null; ly_clkShare: number;
  ty_cartShare: number | null; ly_cartShare: number;
  ty_purShare: number | null; ly_purShare: number;
  ty_revShare: number | null; ly_revShare: number;
  ty_ourCTR: number | null; ty_mktCTR: number | null;
  ty_ourATC: number | null; ty_mktATC: number | null;
  ty_ourCVR: number | null; ty_mktCVR: number | null;
  ly_ourCTR: number; ly_mktCTR: number;
  ly_ourATC: number; ly_mktATC: number;
  ly_ourCVR: number; ly_mktCVR: number;
  ty_ourClickPx: number | null; ty_mktClickPx: number | null;
  ty_ourCartPx: number | null;  ty_mktCartPx: number | null;
  ty_ourPurPx: number | null;   ty_mktPurPx: number | null;
  ly_ourClickPx: number | null; ly_mktClickPx: number | null;
  ly_ourCartPx: number | null;  ly_mktCartPx: number | null;
  ly_ourPurPx: number | null;   ly_mktPurPx: number | null;
  ty_adjCTR?: number | null; ty_adjATC?: number | null; ty_adjCVR?: number | null;
}

type PriceBracket = { label: string; min: number; max: number; ctrImpact: number; atcImpact: number; cvrImpact: number };
const DEFAULT_BRACKETS: PriceBracket[] = [
  { label: '0-15%',  min: 0,  max: 15,      ctrImpact: 3.5,  atcImpact: 2.0,  cvrImpact: 2.0  },
  { label: '15-30%', min: 15, max: 30,       ctrImpact: 8.5,  atcImpact: 5.0,  cvrImpact: 5.0  },
  { label: '30-50%', min: 30, max: 50,       ctrImpact: 17.0, atcImpact: 10.0, cvrImpact: 10.0 },
  { label: '50-80%', min: 50, max: 80,       ctrImpact: 28.5, atcImpact: 16.0, cvrImpact: 16.0 },
  { label: '80%+',   min: 80, max: Infinity, ctrImpact: 35.0, atcImpact: 22.0, cvrImpact: 22.0 },
];
function getPremiumImpact(premium: number, brackets: PriceBracket[], kpi: 'ctr'|'atc'|'cvr') {
  if (premium <= 0) return 0;
  const b = brackets.find(b => premium >= b.min && premium < b.max) ?? brackets[brackets.length - 1];
  return kpi === 'ctr' ? b.ctrImpact : kpi === 'atc' ? b.atcImpact : b.cvrImpact;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function fmtK(n: number | null) {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}
function fmtRev(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}
function fmtPrice(n: number | null) { return n != null && n > 0 ? `$${n.toFixed(2)}` : '—'; }
function fmtPct(n: number | null)   { return n != null ? `${n.toFixed(2)}%` : '—'; }
function yoyPP(ty: number | null, ly: number | null) {
  if (ty == null || ly == null) return { pp: null, pct: null };
  const pp  = ty - ly;
  const pct = ly !== 0 ? (pp / Math.abs(ly)) * 100 : null;
  return { pp, pct };
}
function ppColor(pp: number | null) {
  if (pp == null || Math.abs(pp) < 0.001) return '#71717a';
  return pp > 0 ? '#4ade80' : '#f87171';
}

function buildChartRows(data: YoYRow[], mode: string): ChartRow[] {
  return data.map(r => {
    const ty = r.ty; const ly = r.ly;
    const future = ty === null;
    const label  = mode === 'monthly' ? `M${r.periodNumber}` : `W${r.periodNumber}`;
    const tyRevOur = !future && ty ? ty.ourPurchases    * (ty.ourPurchasePrice    ?? 0) : 0;
    const tyRevMkt = !future && ty ? ty.marketPurchases * (ty.marketPurchasePrice ?? 0) : 0;
    const lyRevOur = ly ? ly.ourPurchases    * (ly.ourPurchasePrice    ?? 0) : 0;
    const lyRevMkt = ly ? ly.marketPurchases * (ly.marketPurchasePrice ?? 0) : 0;
    return {
      label, periodNumber: r.periodNumber, isFutureTY: future,
      ty_sv:        future ? null : (ty?.searchVolume    ?? null),
      ly_sv:        ly?.searchVolume    ?? 0,
      ty_impShare:  future ? null : (ty?.impressionShare ?? null),
      ly_impShare:  ly?.impressionShare ?? 0,
      ty_clkShare:  future ? null : (ty?.clickShare      ?? null),
      ly_clkShare:  ly?.clickShare      ?? 0,
      ty_cartShare: future ? null : (ty?.cartAddShare    ?? null),
      ly_cartShare: ly?.cartAddShare    ?? 0,
      ty_purShare:  future ? null : (ty?.purchaseShare   ?? null),
      ly_purShare:  ly?.purchaseShare   ?? 0,
      ty_revShare:  future ? null : (tyRevMkt > 0 ? Math.min((tyRevOur / tyRevMkt) * 100, 100) : null),
      ly_revShare:  lyRevMkt > 0 ? Math.min((lyRevOur / lyRevMkt) * 100, 100) : 0,
      ty_ourCTR: future ? null : (ty && ty.ourImpressions    > 0 ? (ty.ourClicks      / ty.ourImpressions)    * 100 : null),
      ty_mktCTR: future ? null : (ty && ty.marketImpressions > 0 ? (ty.marketClicks   / ty.marketImpressions) * 100 : null),
      ty_ourATC: future ? null : (ty && ty.ourClicks    > 0 ? (ty.ourCartAdds    / ty.ourClicks)    * 100 : null),
      ty_mktATC: future ? null : (ty && ty.marketClicks > 0 ? (ty.marketCartAdds / ty.marketClicks) * 100 : null),
      ty_ourCVR: future ? null : (ty && ty.ourClicks    > 0 ? (ty.ourPurchases   / ty.ourClicks)    * 100 : null),
      ty_mktCVR: future ? null : (ty && ty.marketClicks > 0 ? (ty.marketPurchases/ ty.marketClicks) * 100 : null),
      ly_ourCTR: ly && ly.ourImpressions    > 0 ? (ly.ourClicks      / ly.ourImpressions)    * 100 : 0,
      ly_mktCTR: ly && ly.marketImpressions > 0 ? (ly.marketClicks   / ly.marketImpressions) * 100 : 0,
      ly_ourATC: ly && ly.ourClicks    > 0 ? (ly.ourCartAdds    / ly.ourClicks)    * 100 : 0,
      ly_mktATC: ly && ly.marketClicks > 0 ? (ly.marketCartAdds / ly.marketClicks) * 100 : 0,
      ly_ourCVR: ly && ly.ourClicks    > 0 ? (ly.ourPurchases   / ly.ourClicks)    * 100 : 0,
      ly_mktCVR: ly && ly.marketClicks > 0 ? (ly.marketPurchases/ ly.marketClicks) * 100 : 0,
      ty_ourClickPx: future ? null : (ty?.ourClickPrice       ?? null),
      ty_mktClickPx: future ? null : (ty?.marketClickPrice    ?? null),
      ty_ourCartPx:  future ? null : (ty?.ourCartPrice        ?? null),
      ty_mktCartPx:  future ? null : (ty?.marketCartPrice     ?? null),
      ty_ourPurPx:   future ? null : (ty?.ourPurchasePrice    ?? null),
      ty_mktPurPx:   future ? null : (ty?.marketPurchasePrice ?? null),
      ly_ourClickPx: ly?.ourClickPrice       ?? null,
      ly_mktClickPx: ly?.marketClickPrice    ?? null,
      ly_ourCartPx:  ly?.ourCartPrice        ?? null,
      ly_mktCartPx:  ly?.marketCartPrice     ?? null,
      ly_ourPurPx:   ly?.ourPurchasePrice    ?? null,
      ly_mktPurPx:   ly?.marketPurchasePrice ?? null,
    };
  });
}

const KW_BADGE: Record<KwMode, { label: string; bg: string; color: string }> = {
  'non-branded': { label: 'Non-Branded Only',      bg: '#1e3a5f', color: '#60a5fa' },
  'both':        { label: 'Branded + Non-Branded', bg: '#3f3f46', color: '#d4d4d8' },
  'branded':     { label: 'Branded Only',          bg: '#14532d', color: '#4ade80' },
};

// ─── INFO BAR: SECTION 1 — SHARE ─────────────────────────────────────────────
function ShareInfoBar({ row, tyYear, lyYear }: { row: ChartRow | null; tyYear: number; lyYear: number }) {
  const kpis = [
    { label: 'Imp Share',   color: '#6366f1', ty: row?.ty_impShare,  ly: row?.ly_impShare  },
    { label: 'Click Share', color: '#06b6d4', ty: row?.ty_clkShare,  ly: row?.ly_clkShare  },
    { label: 'Cart Share',  color: '#f97316', ty: row?.ty_cartShare, ly: row?.ly_cartShare },
    { label: 'Pur Share',   color: '#a855f7', ty: row?.ty_purShare,  ly: row?.ly_purShare  },
    { label: 'Rev Share',   color: '#4ade80', ty: row?.ty_revShare,  ly: row?.ly_revShare  },
  ];
  const tySv = row?.ty_sv ?? null;
  const lySv = row?.ly_sv ?? 0;
  const svPct = tySv != null && lySv > 0 ? ((tySv - lySv) / lySv) * 100 : null;
  return (
    <div style={{ background: '#1e1e21', border: '1px solid #3f3f46', borderRadius: 8, padding: '10px 14px', marginBottom: 10, display: 'flex', alignItems: 'flex-start', gap: 6, minHeight: 70 }}>
      {!row ? (
        <span style={{ fontSize: 12, color: '#71717a', alignSelf: 'center' }}>Hover over a period to see values</span>
      ) : (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#f97316', whiteSpace: 'nowrap', flexShrink: 0, marginTop: 3, marginRight: 4 }}>{row.label}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0 8px', flex: 1 }}>
            {kpis.map(k => {
              const { pp } = yoyPP(k.ty ?? null, k.ly ?? null);
              return (
                <div key={k.label} style={{ background: '#2a2a2e', borderRadius: 6, padding: '6px 4px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: k.color, marginBottom: 3 }}>{k.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{k.ty != null ? `${k.ty.toFixed(1)}%` : '—'}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#d4d4d8' }}>vs {k.ly != null ? `${k.ly.toFixed(1)}%` : '—'}</div>
                  {pp != null
                    ? <div style={{ fontSize: 12, fontWeight: 700, color: ppColor(pp) }}>{pp >= 0 ? '+' : ''}{pp.toFixed(2)}pp</div>
                    : <div style={{ fontSize: 11, color: '#52525b' }}>—</div>
                  }
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 11, whiteSpace: 'nowrap', textAlign: 'right', flexShrink: 0, marginLeft: 6 }}>
            <div style={{ color: '#fff', fontWeight: 600 }}>Vol {tyYear}: {fmtK(tySv)}</div>
            <div style={{ color: '#a1a1aa' }}>Vol {lyYear}: {fmtK(lySv)}</div>
            {svPct != null && <div style={{ fontSize: 10, fontWeight: 700, color: svPct >= 0 ? '#4ade80' : '#f87171' }}>{svPct >= 0 ? '+' : ''}{svPct.toFixed(1)}%</div>}
          </div>
        </>
      )}
    </div>
  );
}

// ─── INFO BAR: SECTION 2 — FUNNEL ────────────────────────────────────────────
function FunnelInfoBar({ row, tyYear, lyYear }: { row: ChartRow | null; tyYear: number; lyYear: number }) {
  const kpis = [
    { label: 'CTR%', color: '#06b6d4', tyO: row?.ty_ourCTR, tyM: row?.ty_mktCTR, lyO: row?.ly_ourCTR, lyM: row?.ly_mktCTR },
    { label: 'ATC%', color: '#f59e0b', tyO: row?.ty_ourATC, tyM: row?.ty_mktATC, lyO: row?.ly_ourATC, lyM: row?.ly_mktATC },
    { label: 'CVR%', color: '#8b5cf6', tyO: row?.ty_ourCVR, tyM: row?.ty_mktCVR, lyO: row?.ly_ourCVR, lyM: row?.ly_mktCVR },
  ];
  const tySv = row?.ty_sv ?? null;
  const lySv = row?.ly_sv ?? 0;
  const svPct = tySv != null && lySv > 0 ? ((tySv - lySv) / lySv) * 100 : null;
  return (
    <div style={{ background: '#1e1e21', border: '1px solid #3f3f46', borderRadius: 8, padding: '10px 14px', marginBottom: 10, display: 'flex', alignItems: 'flex-start', gap: 6, minHeight: 70 }}>
      {!row ? (
        <span style={{ fontSize: 12, color: '#71717a', alignSelf: 'center' }}>Hover over a period to see values</span>
      ) : (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#f97316', whiteSpace: 'nowrap', flexShrink: 0, marginTop: 3, marginRight: 4 }}>{row.label}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0 8px', flex: 1 }}>
            {kpis.map(k => {
              const { pp: ppO } = yoyPP(k.tyO ?? null, k.lyO ?? null);
              const { pp: ppM } = yoyPP(k.tyM ?? null, k.lyM ?? null);
              return (
                <div key={k.label} style={{ background: '#2a2a2e', borderRadius: 6, padding: '6px 6px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: k.color, marginBottom: 3 }}>{k.label}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 4px' }}>
                    <div>
                      <div style={{ fontSize: 9, color: '#71717a' }}>Ours</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#facc15' }}>{fmtPct(k.tyO ?? null)}</div>
                      <div style={{ fontSize: 11, color: '#d4d4d8' }}>vs {fmtPct(k.lyO ?? null)}</div>
                      {ppO != null && <div style={{ fontSize: 10, fontWeight: 700, color: ppColor(ppO) }}>{ppO >= 0 ? '+' : ''}{ppO.toFixed(2)}pp</div>}
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: '#71717a' }}>Market</div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>{fmtPct(k.tyM ?? null)}</div>
                      <div style={{ fontSize: 11, color: '#d4d4d8' }}>vs {fmtPct(k.lyM ?? null)}</div>
                      {ppM != null && <div style={{ fontSize: 10, fontWeight: 700, color: ppColor(ppM) }}>{ppM >= 0 ? '+' : ''}{ppM.toFixed(2)}pp</div>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 11, whiteSpace: 'nowrap', textAlign: 'right', flexShrink: 0, marginLeft: 6 }}>
            <div style={{ color: '#fff', fontWeight: 600 }}>Vol {tyYear}: {fmtK(tySv)}</div>
            <div style={{ color: '#a1a1aa' }}>Vol {lyYear}: {fmtK(lySv)}</div>
            {svPct != null && <div style={{ fontSize: 10, fontWeight: 700, color: svPct >= 0 ? '#4ade80' : '#f87171' }}>{svPct >= 0 ? '+' : ''}{svPct.toFixed(1)}%</div>}
          </div>
        </>
      )}
    </div>
  );
}

// ─── INFO BAR: SECTION 3 — PRICE ─────────────────────────────────────────────
function PriceInfoBar({ row, tyYear, lyYear }: { row: ChartRow | null; tyYear: number; lyYear: number }) {
  const kpis = [
    { label: 'Click Price',    color: '#06b6d4', tyO: row?.ty_ourClickPx, tyM: row?.ty_mktClickPx, lyO: row?.ly_ourClickPx, lyM: row?.ly_mktClickPx },
    { label: 'Cart Add Price', color: '#f59e0b', tyO: row?.ty_ourCartPx,  tyM: row?.ty_mktCartPx,  lyO: row?.ly_ourCartPx,  lyM: row?.ly_mktCartPx  },
    { label: 'Purch Price',    color: '#8b5cf6', tyO: row?.ty_ourPurPx,   tyM: row?.ty_mktPurPx,   lyO: row?.ly_ourPurPx,   lyM: row?.ly_mktPurPx   },
  ];
  const tySv = row?.ty_sv ?? null;
  const lySv = row?.ly_sv ?? 0;
  const svPct = tySv != null && lySv > 0 ? ((tySv - lySv) / lySv) * 100 : null;
  return (
    <div style={{ background: '#1e1e21', border: '1px solid #3f3f46', borderRadius: 8, padding: '10px 14px', marginBottom: 10, display: 'flex', alignItems: 'flex-start', gap: 6, minHeight: 70 }}>
      {!row ? (
        <span style={{ fontSize: 12, color: '#71717a', alignSelf: 'center' }}>Hover over a period to see values</span>
      ) : (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#f97316', whiteSpace: 'nowrap', flexShrink: 0, marginTop: 3, marginRight: 4 }}>{row.label}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0 8px', flex: 1 }}>
            {kpis.map(k => {
              const diffO = k.tyO != null && k.lyO != null ? k.tyO - k.lyO : null;
              const diffM = k.tyM != null && k.lyM != null ? k.tyM - k.lyM : null;
              return (
                <div key={k.label} style={{ background: '#2a2a2e', borderRadius: 6, padding: '6px 6px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: k.color, marginBottom: 3 }}>{k.label}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 4px' }}>
                    <div>
                      <div style={{ fontSize: 9, color: '#71717a' }}>Ours</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#facc15' }}>{fmtPrice(k.tyO ?? null)}</div>
                      <div style={{ fontSize: 11, color: '#d4d4d8' }}>vs {fmtPrice(k.lyO ?? null)}</div>
                      {diffO != null && <div style={{ fontSize: 10, fontWeight: 700, color: diffO >= 0 ? '#4ade80' : '#f87171' }}>{diffO >= 0 ? '+' : '-'}${Math.abs(diffO).toFixed(2)}</div>}
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: '#71717a' }}>Market</div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>{fmtPrice(k.tyM ?? null)}</div>
                      <div style={{ fontSize: 11, color: '#d4d4d8' }}>vs {fmtPrice(k.lyM ?? null)}</div>
                      {diffM != null && <div style={{ fontSize: 10, fontWeight: 700, color: diffM >= 0 ? '#4ade80' : '#f87171' }}>{diffM >= 0 ? '+' : '-'}${Math.abs(diffM).toFixed(2)}</div>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 11, whiteSpace: 'nowrap', textAlign: 'right', flexShrink: 0, marginLeft: 6 }}>
            <div style={{ color: '#fff', fontWeight: 600 }}>Vol {tyYear}: {fmtK(tySv)}</div>
            <div style={{ color: '#a1a1aa' }}>Vol {lyYear}: {fmtK(lySv)}</div>
            {svPct != null && <div style={{ fontSize: 10, fontWeight: 700, color: svPct >= 0 ? '#4ade80' : '#f87171' }}>{svPct >= 0 ? '+' : ''}{svPct.toFixed(1)}%</div>}
          </div>
        </>
      )}
    </div>
  );
}

// ─── TOGGLE ───────────────────────────────────────────────────────────────────
function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold text-zinc-300">{label}</span>
      <button onClick={() => onChange(!value)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${value ? 'bg-orange-500' : 'bg-zinc-600'}`}>
        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${value ? 'translate-x-4' : 'translate-x-1'}`} />
      </button>
    </div>
  );
}

// ─── BRAND SELECT ─────────────────────────────────────────────────────────────
function BrandSelect({ options, selected, onChange }: { options: FilterOption[]; selected: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false); const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch(''); } }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);
  const filtered = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));
  const label = options.find(o => o.value === selected)?.label ?? selected ?? 'Brand';
  return (
    <div ref={ref} className="relative min-w-[160px]">
      <label className="block text-xs font-bold text-white mb-1 uppercase tracking-wide">Brand</label>
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between bg-zinc-700 border border-zinc-600 text-white text-sm rounded px-3 py-2 hover:border-zinc-500 cursor-pointer">
        <span className="truncate">{label}</span>
        <svg className={`w-4 h-4 text-zinc-300 flex-shrink-0 ml-2 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (<div className="absolute z-50 mt-1 w-full min-w-[240px] bg-zinc-700 border border-zinc-600 rounded shadow-xl"><div className="p-2 border-b border-zinc-600"><input autoFocus type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-sm text-white placeholder-zinc-500 outline-none" /></div><div className="overflow-y-auto max-h-52">{filtered.map(opt => (<div key={opt.value} onClick={() => { onChange(opt.value); setOpen(false); setSearch(''); }} className={`px-3 py-2 text-sm cursor-pointer ${selected === opt.value ? 'text-orange-400 bg-orange-500/10' : 'text-zinc-200 hover:bg-zinc-600'}`}>{opt.label}</div>))}</div></div>)}
    </div>
  );
}

// ─── MULTI SELECT ─────────────────────────────────────────────────────────────
function MultiSelect({ label, options, selected, onChange, disabled = false }: { label: string; options: FilterOption[]; selected: string[]; onChange: (v: string[]) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false); const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);
  const filtered = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));
  const allSelected = selected.length === options.length && options.length > 0;
  const toggle = (val: string) => onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);
  const displayText = selected.length === 0 ? `All ${label}` : selected.length === 1 ? (options.find(o => o.value === selected[0])?.label ?? selected[0]) : `${selected.length} ${label} selected`;
  return (
    <div ref={ref} className="relative min-w-[160px]">
      <label className="block text-xs font-bold text-white mb-1 uppercase tracking-wide">{label}</label>
      <button type="button" disabled={disabled} onClick={() => !disabled && setOpen(o => !o)} className={`w-full flex items-center justify-between bg-zinc-700 border border-zinc-600 text-sm rounded px-3 py-2 transition-colors ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:border-zinc-500 cursor-pointer'} ${selected.length > 0 ? 'text-white' : 'text-zinc-300'}`}>
        <span className="truncate">{displayText}</span>
        <svg className={`w-4 h-4 text-zinc-300 flex-shrink-0 ml-2 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (<div className="absolute z-50 mt-1 w-full min-w-[360px] bg-zinc-700 border border-zinc-600 rounded shadow-xl"><div className="p-2 border-b border-zinc-600"><input autoFocus type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-sm text-white placeholder-zinc-500 outline-none" /></div><div className="px-2 py-1 border-b border-zinc-600 flex gap-2"><button onClick={() => onChange(allSelected ? [] : options.map(o => o.value))} className="text-xs text-orange-400 hover:text-orange-300">{allSelected ? 'Clear all' : 'Select all'}</button>{selected.length > 0 && <button onClick={() => onChange([])} className="text-xs text-zinc-400 hover:text-zinc-200">Clear</button>}</div><div className="overflow-y-auto max-h-52">{filtered.map(opt => (<div key={opt.value} onClick={() => toggle(opt.value)} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-zinc-600"><div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${selected.includes(opt.value) ? 'bg-orange-500 border-orange-500' : 'border-zinc-500'}`}>{selected.includes(opt.value) && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}</div><span className="text-sm text-zinc-200 truncate">{opt.label}</span></div>))}</div></div>)}
    </div>
  );
}

// ─── YEAR SELECT ──────────────────────────────────────────────────────────────
function YearSelect({ label: lbl, value, onChange }: { label: string; value: number; onChange: (y: number) => void }) {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i + 1);
  return (
    <div className="relative min-w-[120px]">
      <label className="block text-xs font-bold text-white mb-1 uppercase tracking-wide">{lbl}</label>
      <select value={value} onChange={e => onChange(Number(e.target.value))} className="w-full bg-zinc-700 border border-zinc-600 text-white text-sm rounded px-3 py-2 hover:border-zinc-500 cursor-pointer outline-none appearance-none pr-8">
        {years.map(y => <option key={y} value={y}>{y}</option>)}
      </select>
      <svg className="pointer-events-none absolute right-2 top-[34px] w-4 h-4 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
    </div>
  );
}

// ─── KEYWORD SELECT ───────────────────────────────────────────────────────────
function KeywordSelect({ options, selected, onChange, disabled }: { options: FilterOption[]; selected: string; onChange: (v: string) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false); const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch(''); } }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);
  const filtered = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));
  const label = selected ? (options.find(o => o.value === selected)?.label ?? selected) : 'All Keywords';
  return (
    <div ref={ref} className="relative min-w-[190px]">
      <label className="block text-xs font-bold text-white mb-1 uppercase tracking-wide">Keyword</label>
      <button type="button" disabled={disabled} onClick={() => !disabled && setOpen(o => !o)} className={`w-full flex items-center justify-between bg-zinc-700 border text-sm rounded px-3 py-2 transition-colors ${disabled ? 'opacity-40 cursor-not-allowed border-zinc-600 text-zinc-400' : selected ? 'border-orange-500/60 text-orange-300 hover:border-orange-400 cursor-pointer' : 'border-zinc-600 text-zinc-300 hover:border-zinc-500 cursor-pointer'}`}>
        <span className="truncate">{label}</span>
        <svg className={`w-4 h-4 flex-shrink-0 ml-2 transition-transform text-zinc-300 ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (<div className="absolute z-50 mt-1 w-full min-w-[280px] bg-zinc-700 border border-zinc-600 rounded shadow-xl"><div className="p-2 border-b border-zinc-600"><input autoFocus type="text" placeholder="Search keywords..." value={search} onChange={e => setSearch(e.target.value)} className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-sm text-white placeholder-zinc-500 outline-none" /></div><div className="overflow-y-auto max-h-64"><div onClick={() => { onChange(''); setOpen(false); setSearch(''); }} className={`px-3 py-2 text-sm cursor-pointer italic ${!selected ? 'text-orange-400 bg-orange-500/10' : 'text-zinc-400 hover:bg-zinc-600'}`}>All Keywords</div>{filtered.map(opt => (<div key={opt.value} onClick={() => { onChange(opt.value); setOpen(false); setSearch(''); }} className={`px-3 py-2 text-sm cursor-pointer ${selected === opt.value ? 'text-orange-400 bg-orange-500/10' : 'text-zinc-200 hover:bg-zinc-600'}`}>{opt.label}</div>))}{filtered.length === 0 && <p className="text-xs text-zinc-400 px-3 py-2">No keywords found</p>}</div></div>)}
    </div>
  );
}

// ─── DATA MODAL ───────────────────────────────────────────────────────────────
type ResizeState = { active: boolean; dir: string; startX: number; startY: number; startW: number; startH: number; startL: number; startT: number } | null;
function DataModal({ open, onClose, children, title }: { open: boolean; onClose: () => void; children: React.ReactNode; title: string }) {
  const [dims, setDims] = useState({ w: 0, h: 480, l: 0, t: 0, ready: false });
  const resizingRef = useRef<ResizeState>(null); const modalRef = useRef<HTMLDivElement>(null); const minW = useRef(0);
  useEffect(() => { if (open && !dims.ready && typeof window !== 'undefined') { const w = Math.round(window.innerWidth * 0.50); minW.current = w; setDims({ w, h: 480, l: Math.round((window.innerWidth - w) / 2), t: Math.round((window.innerHeight - 480) / 2), ready: true }); } if (!open) setDims(d => ({ ...d, ready: false })); }, [open]);
  useEffect(() => {
    const applyPos = (l: number, t: number, w: number, h: number) => { const el = modalRef.current; if (!el) return; el.style.left=`${l}px`; el.style.top=`${t}px`; el.style.width=`${w}px`; el.style.height=`${h}px`; };
    const onMove = (e: MouseEvent) => { const r = resizingRef.current; if (!r?.active) return; const dx=e.clientX-r.startX; const dy=e.clientY-r.startY; let{w,h,l,t}={w:r.startW,h:r.startH,l:r.startL,t:r.startT}; if(r.dir==='drag'){l=r.startL+dx;t=r.startT+dy;}else{if(r.dir.includes('e'))w=Math.max(minW.current,r.startW+dx);if(r.dir.includes('s'))h=Math.max(300,r.startH+dy);if(r.dir.includes('w')){const nw=Math.max(minW.current,r.startW-dx);l=r.startL+(r.startW-nw);w=nw;}if(r.dir.includes('n')){const nh=Math.max(300,r.startH-dy);t=r.startT+(r.startH-nh);h=nh;}}applyPos(l,t,w,h); };
    const onUp = () => { const r=resizingRef.current; if(!r?.active)return; resizingRef.current={...r,active:false}; const el=modalRef.current; if(el)setDims({w:parseFloat(el.style.width),h:parseFloat(el.style.height),l:parseFloat(el.style.left),t:parseFloat(el.style.top),ready:true}); };
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp); return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, []);
  useEffect(() => { const h=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();}; document.addEventListener('keydown',h); return ()=>document.removeEventListener('keydown',h); }, [onClose]);
  if (!open || !dims.ready) return null;
  const startResize=(e:React.MouseEvent,dir:string)=>{e.preventDefault();e.stopPropagation();const el=modalRef.current;if(!el)return;resizingRef.current={active:true,dir,startX:e.clientX,startY:e.clientY,startW:parseFloat(el.style.width)||dims.w,startH:parseFloat(el.style.height)||dims.h,startL:parseFloat(el.style.left)||dims.l,startT:parseFloat(el.style.top)||dims.t};};
  const startDrag=(e:React.MouseEvent)=>{e.preventDefault();const el=modalRef.current;if(!el)return;resizingRef.current={active:true,dir:'drag',startX:e.clientX,startY:e.clientY,startW:parseFloat(el.style.width)||dims.w,startH:parseFloat(el.style.height)||dims.h,startL:parseFloat(el.style.left)||dims.l,startT:parseFloat(el.style.top)||dims.t};};
  const edge=(extra:React.CSSProperties):React.CSSProperties=>({position:'absolute',zIndex:10,...extra}); const E=6;
  return (
    <div className="fixed inset-0 z-50" style={{pointerEvents:'none'}}>
      <div className="absolute inset-0 bg-black/70" style={{pointerEvents:'auto'}}/>
      <div ref={modalRef} className="absolute bg-zinc-800 border border-zinc-600 rounded-xl shadow-2xl flex flex-col" style={{width:dims.w,height:dims.h,left:dims.l,top:dims.t,pointerEvents:'auto',minWidth:minW.current,minHeight:300,overflow:'hidden'}}>
        <div style={edge({top:0,left:E,right:E,height:E,cursor:'n-resize'})} onMouseDown={e=>startResize(e,'n')}/><div style={edge({bottom:0,left:E,right:E,height:E,cursor:'s-resize'})} onMouseDown={e=>startResize(e,'s')}/><div style={edge({left:0,top:E,bottom:E,width:E,cursor:'w-resize'})} onMouseDown={e=>startResize(e,'w')}/><div style={edge({right:0,top:E,bottom:E,width:E,cursor:'e-resize'})} onMouseDown={e=>startResize(e,'e')}/><div style={edge({top:0,left:0,width:E,height:E,cursor:'nw-resize'})} onMouseDown={e=>startResize(e,'nw')}/><div style={edge({top:0,right:0,width:E,height:E,cursor:'ne-resize'})} onMouseDown={e=>startResize(e,'ne')}/><div style={edge({bottom:0,left:0,width:E,height:E,cursor:'sw-resize'})} onMouseDown={e=>startResize(e,'sw')}/><div style={edge({bottom:0,right:0,width:E,height:E,cursor:'se-resize'})} onMouseDown={e=>startResize(e,'se')}/>
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-700 flex-shrink-0" style={{cursor:'move',userSelect:'none'}} onMouseDown={startDrag}>
          <h3 className="text-base font-bold text-white">{title} — Data</h3>
          <button onClick={onClose} onMouseDown={e=>e.stopPropagation()} className="text-zinc-300 hover:text-white p-1 rounded hover:bg-zinc-700"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></button>
        </div>
        <div style={{overflow:'auto',flex:1}}><div style={{minWidth:'max-content'}}>{children}</div></div>
      </div>
    </div>
  );
}

// ─── DONUT PILL ───────────────────────────────────────────────────────────────
const DONUT_TRACK: Record<string,string> = {'#6366f1':'#3730a3','#06b6d4':'#164e63','#f97316':'#7c2d12','#a855f7':'#581c87','#4ade80':'#14532d'};
function YoYDonutPill({ label, color, tyShare, lyShare, tyMktValue, tyOurValue, lyMktValue, lyOurValue, tyYear, lyYear }: {
  label:string; color:string; tyShare:number; lyShare:number|null;
  tyMktValue:string; tyOurValue:string; lyMktValue:string|null; lyOurValue:string|null;
  tyYear:number; lyYear:number;
}) {
  const r=38; const circ=2*Math.PI*r;
  const arcLen=Math.min((tyShare/100)*circ,circ-0.5);
  const dashArray=`${arcLen.toFixed(2)} ${(circ-arcLen).toFixed(2)}`;
  const sz=96; const cx=sz/2;
  const pp=lyShare!==null?tyShare-lyShare:null;
  const pct=pp!==null&&lyShare!==null&&lyShare!==0?(pp/Math.abs(lyShare))*100:null;
  const dColor=ppColor(pp);
  return (
    <div className="bg-zinc-700/50 border border-zinc-600 rounded-lg p-3 flex items-center gap-3">
      <div className="relative flex-shrink-0" style={{width:sz,height:sz}}>
        <svg width={sz} height={sz} viewBox={`0 0 ${sz} ${sz}`}>
          <circle cx={cx} cy={cx} r={r} fill="none" stroke={DONUT_TRACK[color]??'#3f3f46'} strokeWidth="10"/>
          <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth="10" strokeDasharray={dashArray} strokeDashoffset="0" transform={`rotate(-90 ${cx} ${cx})`}/>
        </svg>
        <div className="absolute inset-0 flex items-center justify-center"><span style={{fontSize:18,fontWeight:800,color:'#fff'}}>{tyShare.toFixed(1)}%</span></div>
      </div>
      <div className="flex-1 min-w-0">
        <p style={{fontSize:10,fontWeight:800,color:'#fff',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:4}}>{label}</p>
        <span style={{fontSize:12,fontWeight:700,color:'#f97316'}}>{tyYear}</span>
        <div className="flex justify-between"><span style={{fontSize:12,fontWeight:600,color:'#d1d5db'}}>Mkt</span><span style={{fontSize:13,fontWeight:700,color:'#fff'}}>{tyMktValue}</span></div>
        <div className="flex justify-between"><span style={{fontSize:12,fontWeight:600,color:'#d1d5db'}}>Ours</span><span style={{fontSize:13,fontWeight:800,color:'#facc15'}}>{tyOurValue}</span></div>
        <div className="flex justify-between mb-1"><span style={{fontSize:12,fontWeight:600,color:'#d1d5db'}}>Share</span><span style={{fontSize:14,fontWeight:800,color:'#fff'}}>{tyShare.toFixed(1)}%</span></div>
        {pp!==null&&(<div style={{borderTop:'1px solid #3f3f46',borderBottom:'1px solid #3f3f46',padding:'2px 0',margin:'2px 0',textAlign:'right'}}><div style={{fontSize:11,fontWeight:800,color:dColor}}>{pp>=0?'+':''}{pp.toFixed(2)}pp YoY</div>{pct!==null&&<div style={{fontSize:10,fontWeight:600,color:dColor}}>({pct>=0?'+':''}{pct.toFixed(1)}%)</div>}</div>)}
        {lyShare!==null&&(<><span style={{fontSize:12,fontWeight:700,color:'#71717a'}}>{lyYear}</span>{lyMktValue&&<div className="flex justify-between"><span style={{fontSize:13,fontWeight:600,color:'#c4c4c8'}}>Mkt</span><span style={{fontSize:13,color:'#c4c4c8'}}>{lyMktValue}</span></div>}{lyOurValue&&<div className="flex justify-between"><span style={{fontSize:13,fontWeight:600,color:'#c4c4c8'}}>Ours</span><span style={{fontSize:13,color:'#c4c4c8'}}>{lyOurValue}</span></div>}<div className="flex justify-between"><span style={{fontSize:13,fontWeight:600,color:'#c4c4c8'}}>Share</span><span style={{fontSize:11,fontWeight:600,color:'#a1a1aa'}}>{lyShare.toFixed(1)}%</span></div></>)}
      </div>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function YoYPage() {
  const { mode, setMode, selBrands, setSelBrands, selFamilies, setSelFamilies, selAsins, setSelAsins } = useFilters();

  const [brands,      setBrands]      = useState<FilterOption[]>([]);
  const [families,    setFamilies]    = useState<FilterOption[]>([]);
  const [asinOptions, setAsinOptions] = useState<FilterOption[]>([]);
  const [kwOptions,   setKwOptions]   = useState<FilterOption[]>([]);
  const [kwLoading,   setKwLoading]   = useState(false);
  const [selKeyword,  setSelKeyword]  = useState('');
  const [selTyYear,   setSelTyYear]   = useState<number>(new Date().getFullYear());
  const [selLyYear,   setSelLyYear]   = useState<number>(new Date().getFullYear() - 1);
  const [kwMode,      setKwMode]      = useState<KwMode>('both');
  const [rawData,     setRawData]     = useState<YoYRow[]>([]);
  const [tyYear,      setTyYear]      = useState<number>(new Date().getFullYear());
  const [lyYear,      setLyYear]      = useState<number>(new Date().getFullYear() - 1);
  const [loading,     setLoading]     = useState(false);

  const [hovered1, setHovered1] = useState<ChartRow | null>(null);
  const [hovered2, setHovered2] = useState<ChartRow | null>(null);
  const [hovered3, setHovered3] = useState<ChartRow | null>(null);

  const [singleKpi1,  setSingleKpi1]  = useState(false);
  const [activeKpi1,  setActiveKpi1]  = useState<'ty_impShare'|'ty_clkShare'|'ty_cartShare'|'ty_purShare'|'ty_revShare'>('ty_impShare');
  const [modal1Open,  setModal1Open]  = useState(false);
  const [modal2Open,  setModal2Open]  = useState(false);
  const [modal3Open,  setModal3Open]  = useState(false);
  const [singleKpi2,  setSingleKpi2]  = useState(false);
  const [activeKpi2,  setActiveKpi2]  = useState<'ctr'|'atc'|'cvr'>('ctr');
  const [singleKpi3,  setSingleKpi3]  = useState(false);
  const [activeKpi3,  setActiveKpi3]  = useState<'click'|'atc'|'purchase'>('click');
  const [priceAdjOn,  setPriceAdjOn]  = useState(false);
  const [priceAdjExp, setPriceAdjExp] = useState(false);
  const [brackets,    setBrackets]    = useState<PriceBracket[]>(DEFAULT_BRACKETS.map(b => ({...b})));

  const autoSelectDone       = useRef(false);
  const autoSelectInProgress = useRef(false);
  const familiesInitialized  = useRef(false);
  const selBrand = selBrands.length > 0 ? selBrands[0] : '';

  const autoSelectTopFamily = useCallback(async (brand: string) => {
    try { const res=await fetch(`/api/dashboard/filters?type=top-family&brand=${encodeURIComponent(brand)}`); const d=await res.json(); if(d.family) setSelFamilies([d.family]); } catch {}
  }, [setSelFamilies]);

  useEffect(() => {
    fetch('/api/dashboard/filters?type=brands').then(r=>r.json()).then(d=>{
      const opts=(d.brands??[]).map((b:string)=>({value:b,label:b}));
      setBrands(opts);
      if(opts.length>0&&!autoSelectDone.current){
        autoSelectDone.current=true;
        const brandToUse=selBrands.length>0?selBrands[0]:opts[0].value;
        if(selBrands.length===0){autoSelectInProgress.current=true;setSelBrands([brandToUse]);autoSelectTopFamily(brandToUse).then(()=>{autoSelectInProgress.current=false;});}
      }
    });
  }, []);

  useEffect(() => {
    const params=selBrands.length>0?`&brands=${selBrands.join(',')}`:'';
    fetch(`/api/dashboard/filters?type=families${params}`).then(r=>r.json()).then(d=>setFamilies((d.families??[]).map((f:any)=>({value:f.family_name,label:f.family_name}))));
  }, [selBrands]);

  useEffect(() => {
    const fp=selFamilies.length>0?`families=${selFamilies.join(',')}`:'';
    const bp=selBrands.length>0?`brands=${selBrands.join(',')}`:'';
    const p=fp||bp; if(!p){setAsinOptions([]);return;}
    fetch(`/api/dashboard/filters?type=asins&${p}`).then(r=>r.json()).then(d=>{
      setAsinOptions((d.asins??[]).map((a:any)=>({value:a.child_asin,label:a.product_name||a.child_asin})));
      if(familiesInitialized.current)setSelAsins([]);
      else familiesInitialized.current=true;
    });
  }, [selFamilies, selBrands]);

  useEffect(() => {
    const fp=selFamilies.length>0?`families=${selFamilies.join(',')}`:'';
    const bp=selBrands.length>0?`brands=${selBrands.join(',')}`:'';
    const p=fp||bp; if(!p){setKwOptions([]);setSelKeyword('');return;}
    setKwLoading(true);
    const kwParam=kwMode!=='both'?`&kwMode=${kwMode}`:'';
    fetch(`/api/dashboard/filters?type=keywords&${p}${kwParam}`)
      .then(r=>r.json()).then(d=>{const opts=(d.keywords??[]).map((k:string)=>({value:k,label:k}));setKwOptions(opts);setSelKeyword(prev=>opts.find((o:FilterOption)=>o.value===prev)?prev:'');})
      .catch(()=>setKwOptions([])).finally(()=>setKwLoading(false));
  }, [selFamilies, selBrands, kwMode]);

  const handleBrandChange = useCallback((brand:string)=>{
    autoSelectInProgress.current=true; setSelBrands([brand]); setSelFamilies([]); setSelAsins([]); setSelKeyword('');
    autoSelectTopFamily(brand).then(()=>{autoSelectInProgress.current=false;});
  }, [setSelBrands,setSelFamilies,setSelAsins,autoSelectTopFamily]);

  const hasFilter = selBrands.length>0||selFamilies.length>0||selAsins.length>0;

  const fetchData = useCallback(async () => {
    if(!hasFilter||autoSelectInProgress.current){setRawData([]);return;}
    setLoading(true);
    try {
      const res=await fetch('/api/dashboard/yoy',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({asins:selAsins,families:selFamilies,brands:selBrands,tyYear:selTyYear,lyYear:selLyYear,mode,kwMode,...(selKeyword?{singleKeyword:selKeyword}:{})}),
      });
      const json=await res.json();
      setRawData(json.data??[]);
      setTyYear(json.tyYear??selTyYear);
      setLyYear(json.lyYear??selLyYear);
    } finally{setLoading(false);}
  }, [selAsins,selFamilies,selBrands,selTyYear,selLyYear,mode,kwMode,selKeyword,hasFilter]);

  useEffect(()=>{fetchData();},[fetchData]);

  // Derived
  const chartRows     = buildChartRows(rawData, mode);
  const latestRealRow = [...rawData].reverse().find(r=>r.ty!==null)??null;
  const ty = latestRealRow?.ty??null;
  const ly = latestRealRow?.ly??null;

  const tyRevOur   = ty?ty.ourPurchases*(ty.ourPurchasePrice??0):0;
  const tyRevMkt   = ty?ty.marketPurchases*(ty.marketPurchasePrice??0):0;
  const tyRevShare = tyRevMkt>0?Math.min((tyRevOur/tyRevMkt)*100, 100):0;
  const lyRevOur   = ly?ly.ourPurchases*(ly.ourPurchasePrice??0):0;
  const lyRevMkt   = ly?ly.marketPurchases*(ly.marketPurchasePrice??0):0;
  const lyRevShare = lyRevMkt>0?Math.min((lyRevOur/lyRevMkt)*100, 100):null;

  const chartRowsWithAdj = chartRows.map(row=>{
    const adjCTR=(()=>{if(!priceAdjOn||!row.ty_ourClickPx||!row.ty_mktClickPx)return null;const p=((row.ty_ourClickPx/row.ty_mktClickPx)-1)*100;return row.ty_mktCTR!=null?row.ty_mktCTR*(1-getPremiumImpact(p,brackets,'ctr')/100):null;})();
    const adjATC=(()=>{if(!priceAdjOn||!row.ty_ourCartPx||!row.ty_mktCartPx)return null;const p=((row.ty_ourCartPx/row.ty_mktCartPx)-1)*100;return row.ty_mktATC!=null?row.ty_mktATC*(1-getPremiumImpact(p,brackets,'atc')/100):null;})();
    const adjCVR=(()=>{if(!priceAdjOn||!row.ty_ourPurPx||!row.ty_mktPurPx)return null;const p=((row.ty_ourPurPx/row.ty_mktPurPx)-1)*100;return row.ty_mktCVR!=null?row.ty_mktCVR*(1-getPremiumImpact(p,brackets,'cvr')/100):null;})();
    return{...row,ty_adjCTR:adjCTR,ty_adjATC:adjATC,ty_adjCVR:adjCVR};
  });

  const badge     = KW_BADGE[kwMode];
  const maxPeriod = rawData.length>0?rawData[rawData.length-1].periodNumber:0;
  const periodRange = chartRows.length>0?`${mode==='monthly'?'M':'W'}1–${mode==='monthly'?'M':'W'}${maxPeriod}`:'';

  const funnelPills=[
    {label:'CTR%',tyOurs:ty&&ty.ourImpressions>0?(ty.ourClicks/ty.ourImpressions)*100:0,tyMkt:ty&&ty.marketImpressions>0?(ty.marketClicks/ty.marketImpressions)*100:0,lyOurs:ly&&ly.ourImpressions>0?(ly.ourClicks/ly.ourImpressions)*100:null,lyMkt:ly&&ly.marketImpressions>0?(ly.marketClicks/ly.marketImpressions)*100:null,tyOurPx:ty?.ourClickPrice??null,tyMktPx:ty?.marketClickPrice??null,adjColor:'#67E8F9' as const},
    {label:'ATC%',tyOurs:ty&&ty.ourClicks>0?(ty.ourCartAdds/ty.ourClicks)*100:0,tyMkt:ty&&ty.marketClicks>0?(ty.marketCartAdds/ty.marketClicks)*100:0,lyOurs:ly&&ly.ourClicks>0?(ly.ourCartAdds/ly.ourClicks)*100:null,lyMkt:ly&&ly.marketClicks>0?(ly.marketCartAdds/ly.marketClicks)*100:null,tyOurPx:ty?.ourCartPrice??null,tyMktPx:ty?.marketCartPrice??null,adjColor:'#FCD34D' as const},
    {label:'CVR%',tyOurs:ty&&ty.ourClicks>0?(ty.ourPurchases/ty.ourClicks)*100:0,tyMkt:ty&&ty.marketClicks>0?(ty.marketPurchases/ty.marketClicks)*100:0,lyOurs:ly&&ly.ourClicks>0?(ly.ourPurchases/ly.ourClicks)*100:null,lyMkt:ly&&ly.marketClicks>0?(ly.marketPurchases/ly.marketClicks)*100:null,tyOurPx:ty?.ourPurchasePrice??null,tyMktPx:ty?.marketPurchasePrice??null,adjColor:'#C4B5FD' as const},
  ];

  const WB='2px solid rgba(255,255,255,0.20)';
  const HB='2px solid rgba(255,255,255,0.25)';
  const RB='1px solid rgba(255,255,255,0.10)';

  // Tooltip content functions — set hover state via setTimeout to avoid setState-during-render
  const tooltip1=useCallback((props:any)=>{const row=props?.active&&props?.payload?.[0]?.payload?props.payload[0].payload as ChartRow:null;setTimeout(()=>setHovered1(row),0);return null;},[]);
  const tooltip2=useCallback((props:any)=>{const row=props?.active&&props?.payload?.[0]?.payload?props.payload[0].payload as ChartRow:null;setTimeout(()=>setHovered2(row),0);return null;},[]);
  const tooltip3=useCallback((props:any)=>{const row=props?.active&&props?.payload?.[0]?.payload?props.payload[0].payload as ChartRow:null;setTimeout(()=>setHovered3(row),0);return null;},[]);

  return (
    <div className="min-h-screen bg-zinc-900 text-white">
      <div className="border-b border-zinc-700 px-8 py-5">
        <h1 className="text-xl font-bold text-white">Year Comparison</h1>
        <p className="text-sm text-zinc-200 mt-1">This year vs comparison year · all changes YoY</p>
      </div>
      <div className="border-b border-zinc-700 px-8">
        <div className="flex">
          {([['weekly','Week over Week'],['monthly','Month over Month']] as const).map(([val,lbl])=>(
            <button key={val} onClick={()=>setMode(val)} className={`py-4 px-6 text-sm font-semibold border-b-2 transition-colors ${mode===val?'border-orange-400 text-orange-400':'border-transparent text-zinc-300 hover:text-white'}`}>{lbl}</button>
          ))}
        </div>
      </div>

      <div className="px-8 py-6 space-y-6">

        {/* ── FILTER BAR ── */}
        <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4">
          <div className="flex flex-wrap gap-4 items-end">
            <BrandSelect options={brands} selected={selBrand} onChange={handleBrandChange}/>
            <MultiSelect label="Family" options={families} selected={selFamilies} onChange={v=>{setSelFamilies(v);setSelAsins([]);setSelKeyword('');}} disabled={brands.length===0}/>
            <MultiSelect label="Product (ASIN)" options={asinOptions} selected={selAsins} onChange={setSelAsins} disabled={asinOptions.length===0}/>
            <YearSelect label="This Year"    value={selTyYear} onChange={setSelTyYear}/>
            <YearSelect label="Compare Year" value={selLyYear} onChange={setSelLyYear}/>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-bold text-white uppercase tracking-wide">Keyword Type</span>
              <div className="flex bg-zinc-900 border border-zinc-700 rounded-lg overflow-hidden">
                {(['non-branded','both','branded'] as KwMode[]).map(m=>{
                  const isActive=kwMode===m;
                  const activeStyle=m==='non-branded'?'bg-blue-900 text-blue-300':m==='branded'?'bg-green-900 text-green-400':'bg-zinc-600 text-white';
                  return(<button key={m} onClick={()=>{setKwMode(m);setSelKeyword('');}} className={`px-3 py-2 text-xs font-bold transition-colors border-r border-zinc-700 last:border-r-0 whitespace-nowrap ${isActive?activeStyle:'text-zinc-400 hover:text-zinc-200'}`}>{m==='non-branded'?'Non-Branded':m==='branded'?'Branded':'Branded + Non-Branded'}</button>);
                })}
              </div>
            </div>
            <KeywordSelect options={kwOptions} selected={selKeyword} onChange={setSelKeyword} disabled={kwLoading||kwOptions.length===0}/>
            <button onClick={fetchData} disabled={loading} className="px-4 py-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white rounded text-sm font-bold self-end">{loading?'Loading...':'Apply'}</button>
          </div>
          {selKeyword&&(<div className="mt-2 flex items-center gap-2"><span style={{fontSize:11,background:'#1e3a5f',color:'#60a5fa',borderRadius:4,padding:'2px 8px',fontWeight:700}}>Single keyword: {selKeyword}</span><button onClick={()=>setSelKeyword('')} className="text-xs text-zinc-400 hover:text-zinc-200 underline">Clear</button></div>)}
        </div>

        {/* ══ SECTION 1: MARKET SHARE TRENDS ══ */}
        <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Market Share Trends
                {periodRange&&<span className="text-xs font-bold bg-zinc-700 text-zinc-300 rounded px-2 py-0.5">{periodRange} · {tyYear} vs {lyYear}</span>}
                <span style={{fontSize:10,fontWeight:700,background:badge.bg,color:badge.color,borderRadius:4,padding:'2px 8px'}}>{badge.label}</span>
              </h2>
              <p className="text-xs text-zinc-200 mt-0.5">Donuts — latest share · Lines — YoY trend · Bars — search volume</p>
            </div>
            <div className="flex items-center gap-3 flex-wrap justify-end">
              {loading&&<p className="text-xs text-orange-400 animate-pulse font-semibold">Refreshing...</p>}
              <Toggle value={singleKpi1} onChange={setSingleKpi1} label="Single KPI"/>
              {singleKpi1&&(<div className="flex gap-1 bg-zinc-700 rounded-lg p-1">{([{key:'ty_impShare',label:'Impression',color:'#6366f1'},{key:'ty_clkShare',label:'Click',color:'#06b6d4'},{key:'ty_cartShare',label:'Cart',color:'#f97316'},{key:'ty_purShare',label:'Purchase',color:'#a855f7'},{key:'ty_revShare',label:'Revenue',color:'#4ade80'}] as const).map(({key,label:lbl,color})=>(<button key={key} onClick={()=>setActiveKpi1(key)} className={`px-3 py-1.5 rounded text-sm font-semibold transition-colors ${activeKpi1===key?'bg-zinc-600':'text-zinc-400 hover:text-zinc-200'}`} style={activeKpi1===key?{color}:{}}>{lbl}</button>))}</div>)}
              <button onClick={()=>setModal1Open(true)} className="px-3 py-1.5 text-xs font-semibold text-orange-400 border border-zinc-600 rounded hover:border-orange-400 hover:text-orange-300">Show Data</button>
            </div>
          </div>

          {/* Donut pills */}
          {ty&&(
            <div className="grid grid-cols-5 gap-3 mb-4">
              {[
                {label:'Impression Share',color:'#6366f1',tyShare:ty.impressionShare,lyShare:ly?.impressionShare??null,tyMkt:fmtK(ty.marketImpressions),tyOur:fmtK(ty.ourImpressions),lyMkt:ly?fmtK(ly.marketImpressions):null,lyOur:ly?fmtK(ly.ourImpressions):null},
                {label:'Click Share',color:'#06b6d4',tyShare:ty.clickShare,lyShare:ly?.clickShare??null,tyMkt:fmtK(ty.marketClicks),tyOur:fmtK(ty.ourClicks),lyMkt:ly?fmtK(ly.marketClicks):null,lyOur:ly?fmtK(ly.ourClicks):null},
                {label:'Cart Share',color:'#f97316',tyShare:ty.cartAddShare,lyShare:ly?.cartAddShare??null,tyMkt:fmtK(ty.marketCartAdds),tyOur:fmtK(ty.ourCartAdds),lyMkt:ly?fmtK(ly.marketCartAdds):null,lyOur:ly?fmtK(ly.ourCartAdds):null},
                {label:'Purchase Share',color:'#a855f7',tyShare:ty.purchaseShare,lyShare:ly?.purchaseShare??null,tyMkt:fmtK(ty.marketPurchases),tyOur:fmtK(ty.ourPurchases),lyMkt:ly?fmtK(ly.marketPurchases):null,lyOur:ly?fmtK(ly.ourPurchases):null},
                {label:'Revenue Share',color:'#4ade80',tyShare:tyRevShare,lyShare:lyRevShare,tyMkt:fmtRev(tyRevMkt),tyOur:fmtRev(tyRevOur),lyMkt:ly?fmtRev(lyRevMkt):null,lyOur:ly?fmtRev(lyRevOur):null},
              ].map(p=>(<YoYDonutPill key={p.label} label={p.label} color={p.color} tyShare={p.tyShare} lyShare={p.lyShare} tyMktValue={p.tyMkt} tyOurValue={p.tyOur} lyMktValue={p.lyMkt} lyOurValue={p.lyOur} tyYear={tyYear} lyYear={lyYear}/>))}
            </div>
          )}

          {/* Info bar — between pills and chart */}
          <ShareInfoBar row={hovered1} tyYear={tyYear} lyYear={lyYear}/>

          {chartRows.length===0&&!loading?(
            <div className="flex items-center justify-center h-64"><p className="text-zinc-300 text-sm font-semibold">Select a Brand or Family to load data</p></div>
          ):(
            <ResponsiveContainer width="100%" height={340}>
              <ComposedChart data={chartRows} margin={{top:5,right:30,left:20,bottom:5}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1F2937"/>
                <XAxis dataKey="label" tick={{fill:'#d4d4d8',fontSize:11}} axisLine={{stroke:'#374151'}} tickLine={false}/>
                <YAxis yAxisId="vol"   orientation="left"  tick={{fill:'#d4d4d8',fontSize:11}} axisLine={false} tickLine={false} tickFormatter={v=>v>=1000?`${(v/1000).toFixed(0)}K`:String(v)}/>
                <YAxis yAxisId="share" orientation="right" tick={{fill:'#d4d4d8',fontSize:11}} axisLine={false} tickLine={false} tickFormatter={v=>`${v}%`} domain={[0,'auto']}/>
                <Tooltip content={tooltip1} cursor={{stroke:'#525252',strokeWidth:1}}/>
                <Legend wrapperStyle={{fontSize:'12px',paddingTop:'16px'}} formatter={v=><span style={{color:'#e4e4e7'}}>{v}</span>}/>
                <Bar yAxisId="vol" dataKey="ty_sv" name={`${tyYear} Vol`} fill="#7c3f00" opacity={0.8} radius={[2,2,0,0]}/>
                <Bar yAxisId="vol" dataKey="ly_sv" name={`${lyYear} Vol`} fill="#3f3f46" opacity={0.6} radius={[2,2,0,0]}/>
                {singleKpi1?(
                  <>
                    <Line yAxisId="share" type="monotone" dataKey={activeKpi1} name={`${tyYear}`} stroke="#f97316" strokeWidth={2.5} dot={{r:3,fill:'#f97316'}} connectNulls={false}/>
                    <Line yAxisId="share" type="monotone" dataKey={activeKpi1.replace('ty_','ly_')} name={`${lyYear}`} stroke="#a1a1aa" strokeWidth={2} dot={false} strokeDasharray="5 3"/>
                  </>
                ):(
                  <>
                    <Line yAxisId="share" type="monotone" dataKey="ty_impShare"  name={`${tyYear} Imp`}  stroke="#6366f1" strokeWidth={2}   dot={false} connectNulls={false}/>
                    <Line yAxisId="share" type="monotone" dataKey="ly_impShare"  name={`${lyYear} Imp`}  stroke="#6366f1" strokeWidth={1.5} dot={false} strokeDasharray="5 3" opacity={0.6}/>
                    <Line yAxisId="share" type="monotone" dataKey="ty_clkShare"  name={`${tyYear} Clk`}  stroke="#06b6d4" strokeWidth={2}   dot={false} connectNulls={false}/>
                    <Line yAxisId="share" type="monotone" dataKey="ly_clkShare"  name={`${lyYear} Clk`}  stroke="#06b6d4" strokeWidth={1.5} dot={false} strokeDasharray="5 3" opacity={0.6}/>
                    <Line yAxisId="share" type="monotone" dataKey="ty_cartShare" name={`${tyYear} Cart`} stroke="#f97316" strokeWidth={2}   dot={false} connectNulls={false}/>
                    <Line yAxisId="share" type="monotone" dataKey="ly_cartShare" name={`${lyYear} Cart`} stroke="#f97316" strokeWidth={1.5} dot={false} strokeDasharray="5 3" opacity={0.6}/>
                    <Line yAxisId="share" type="monotone" dataKey="ty_purShare"  name={`${tyYear} Pur`}  stroke="#a855f7" strokeWidth={2}   dot={false} connectNulls={false}/>
                    <Line yAxisId="share" type="monotone" dataKey="ly_purShare"  name={`${lyYear} Pur`}  stroke="#a855f7" strokeWidth={1.5} dot={false} strokeDasharray="5 3" opacity={0.6}/>
                    <Line yAxisId="share" type="monotone" dataKey="ty_revShare"  name={`${tyYear} Rev`}  stroke="#4ade80" strokeWidth={2}   dot={false} connectNulls={false}/>
                    <Line yAxisId="share" type="monotone" dataKey="ly_revShare"  name={`${lyYear} Rev`}  stroke="#4ade80" strokeWidth={1.5} dot={false} strokeDasharray="5 3" opacity={0.6}/>
                  </>
                )}
              </ComposedChart>
            </ResponsiveContainer>
          )}
          <p className="text-xs text-zinc-400 mt-2">Solid = {tyYear} · Dashed = {lyYear} · Dark bars = {tyYear} vol · Grey bars = {lyYear} vol</p>
        </div>

        {/* ── SECTION 1 MODAL ── */}
        <DataModal open={modal1Open} onClose={()=>setModal1Open(false)} title="Market Share Trends YoY">
          <table style={{borderCollapse:'collapse',fontSize:11}}>
            <thead style={{position:'sticky',top:0,zIndex:2,background:'#18181b'}}>
              <tr>
                <th rowSpan={2} style={{padding:'10px 14px',textAlign:'left',fontWeight:700,color:'#fff',borderBottom:HB}}>Period</th>
                {[{label:'Impression Share',color:'#6366f1'},{label:'Click Share',color:'#06b6d4'},{label:'Cart Share',color:'#f97316'},{label:'Purchase Share',color:'#a855f7'},{label:'Revenue Share',color:'#22c55e'}].map(g=>(<th key={g.label} colSpan={3} style={{background:'#1e1e22',padding:'7px 10px 5px',textAlign:'center',fontWeight:700,textTransform:'uppercase',borderBottom:HB,borderLeft:WB,color:g.color,whiteSpace:'nowrap'}}>{g.label}</th>))}
              </tr>
              <tr style={{background:'#1a1a1e',borderBottom:HB}}>
                {[0,1,2,3,4].map(i=>(<React.Fragment key={i}><th style={{padding:'5px 8px',textAlign:'center',fontWeight:700,color:'#f97316',borderLeft:WB,whiteSpace:'nowrap'}}>{tyYear}</th><th style={{padding:'5px 8px',textAlign:'center',fontWeight:700,color:'#a1a1aa',whiteSpace:'nowrap'}}>{lyYear}</th><th style={{padding:'5px 8px',textAlign:'center',fontWeight:700,color:'#4ade80',whiteSpace:'nowrap'}}>YoY pp</th></React.Fragment>))}
              </tr>
            </thead>
            <tbody>
              {[...chartRows].reverse().filter(r=>!r.isFutureTY).map(row=>{
                const ks=[{ty:row.ty_impShare,ly:row.ly_impShare},{ty:row.ty_clkShare,ly:row.ly_clkShare},{ty:row.ty_cartShare,ly:row.ly_cartShare},{ty:row.ty_purShare,ly:row.ly_purShare},{ty:row.ty_revShare,ly:row.ly_revShare}];
                return(<tr key={row.periodNumber} style={{borderBottom:RB}} onMouseEnter={e=>(e.currentTarget.style.background='#27272a')} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}><td style={{padding:'8px 14px',fontWeight:700,color:'#fff'}}>{row.label}</td>{ks.map((k,i)=>{const{pp,pct}=yoyPP(k.ty,k.ly);const dColor=ppColor(pp);return(<React.Fragment key={i}><td style={{padding:'7px 10px',textAlign:'center',fontWeight:700,color:'#f97316',borderLeft:WB}}>{k.ty!=null?`${k.ty.toFixed(1)}%`:'—'}</td><td style={{padding:'7px 10px',textAlign:'center',fontWeight:600,color:'#a1a1aa'}}>{k.ly!=null?`${k.ly.toFixed(1)}%`:'—'}</td><td style={{padding:'7px 10px',textAlign:'center',fontWeight:700,color:dColor}}>{pp!=null?`${pp>=0?'+':''}${pp.toFixed(2)}pp`:'—'}{pct!=null&&<div style={{fontSize:10,color:dColor}}>({pct>=0?'+':''}{pct.toFixed(1)}%)</div>}</td></React.Fragment>);})}</tr>);
              })}
            </tbody>
          </table>
        </DataModal>

        {/* ══ SECTION 2: CONVERSION FUNNEL RATES ══ */}
        <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-white">Conversion Funnel Rates</h2>
              <p className="text-xs text-zinc-300 mt-0.5">CTR% · ATC% · CVR% — {tyYear} vs {lyYear}</p>
            </div>
            <div className="flex items-center gap-3 flex-wrap justify-end">
              <Toggle value={priceAdjOn} onChange={v=>{setPriceAdjOn(v);if(v)setPriceAdjExp(true);}} label="Price Adjust"/>
              <Toggle value={singleKpi2} onChange={setSingleKpi2} label="Single KPI"/>
              {singleKpi2&&(<div className="flex gap-1 bg-zinc-700 rounded-lg p-1">{([{key:'ctr',label:'CTR%',color:'#06B6D4'},{key:'atc',label:'ATC%',color:'#F59E0B'},{key:'cvr',label:'CVR%',color:'#8B5CF6'}] as const).map(({key,label:lbl,color})=>(<button key={key} onClick={()=>setActiveKpi2(key)} className={`px-4 py-1.5 rounded text-sm font-semibold transition-colors ${activeKpi2===key?'bg-zinc-600':'text-zinc-400 hover:text-zinc-200'}`} style={activeKpi2===key?{color}:{}}>{lbl}</button>))}</div>)}
              <button onClick={()=>setModal2Open(true)} className="px-3 py-1.5 text-xs font-semibold text-orange-400 border border-zinc-600 rounded hover:border-orange-400 hover:text-orange-300">Show Data</button>
            </div>
          </div>

          {/* Price adjust panel */}
          {priceAdjOn&&(
            <div className="mb-4 border border-orange-900/40 rounded-lg overflow-hidden">
              <button onClick={()=>setPriceAdjExp(v=>!v)} className="w-full flex items-center justify-between px-4 py-3 bg-orange-950/20 hover:bg-orange-950/30 transition-colors">
                <div className="flex items-center gap-2">
                  <svg className={`w-4 h-4 text-orange-400 transition-transform ${priceAdjExp?'rotate-90':''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
                  <span className="text-sm font-bold text-orange-400">Price Adjustment Settings</span>
                </div>
              </button>
              {priceAdjExp&&(
                <div className="p-4 bg-zinc-800/50">
                  <p className="text-xs font-bold text-white mb-2 uppercase tracking-wide">Impact Brackets</p>
                  <table className="w-full text-xs"><thead><tr className="border-b border-zinc-600"><th className="text-left px-3 py-2 text-zinc-200 font-bold">Price Premium</th><th className="text-center px-3 py-2 text-cyan-400 font-bold">CTR Impact %</th><th className="text-center px-3 py-2 text-yellow-400 font-bold">ATC Impact %</th><th className="text-center px-3 py-2 text-purple-400 font-bold">CVR Impact %</th></tr></thead>
                    <tbody>{brackets.map((b,i)=>(<tr key={i} className="border-b border-zinc-700/50"><td className="px-3 py-2 text-white font-semibold">{b.label}</td>{(['ctrImpact','atcImpact','cvrImpact'] as const).map(field=>(<td key={field} className="px-3 py-2 text-center"><input type="number" value={b[field]} step="0.5" min="0" max="100" onChange={e=>setBrackets(prev=>prev.map((x,j)=>j===i?{...x,[field]:parseFloat(e.target.value)||0}:x))} className="w-16 bg-zinc-600 border border-zinc-600 rounded px-2 py-1 text-white text-center outline-none focus:border-orange-400 text-xs"/><span className="text-zinc-300 ml-1">%</span></td>))}</tr>))}</tbody>
                  </table>
                  <button onClick={()=>setBrackets(DEFAULT_BRACKETS.map(b=>({...b})))} className="mt-2 text-xs text-zinc-300 hover:text-white underline">Reset to defaults</button>
                </div>
              )}
            </div>
          )}

          {/* Funnel pills */}
          {ty&&(
            <div className="grid grid-cols-3 gap-3 mb-4">
              {funnelPills.map(p=>{
                const kpiKey=p.label==='CTR%'?'ctr':p.label==='ATC%'?'atc':'cvr';
                const premium=p.tyOurPx&&p.tyMktPx?((p.tyOurPx/p.tyMktPx)-1)*100:0;
                const adjMkt=priceAdjOn&&p.tyMkt>0?p.tyMkt*(1-getPremiumImpact(premium,brackets,kpiKey)/100):null;
                const{pp:ppOurs,pct:pctOurs}=yoyPP(p.tyOurs,p.lyOurs);
                const{pp:ppMkt,pct:pctMkt}=yoyPP(p.tyMkt,p.lyMkt);
                const ppAdjMkt=adjMkt!=null&&p.lyMkt!=null?yoyPP(adjMkt,p.lyMkt).pp:null;
                return(
                  <div key={p.label} className="bg-zinc-700/50 border border-zinc-600 rounded-lg px-4 py-3">
                    <p style={{fontSize:15,fontWeight:800,color:"#ffffff",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>{p.label}</p>
                    <div className={`grid gap-3 ${adjMkt!=null?'grid-cols-3':'grid-cols-2'}`}>
                      <div>
                        <p style={{fontSize:13,fontWeight:700,color:"#e4e4e7",marginBottom:4}}>Ours {tyYear}</p>
                        <p className="text-xl font-bold text-yellow-400">{p.tyOurs.toFixed(2)}%</p>
                        {ppOurs!==null&&(<div style={{borderTop:'1px solid #3f3f46',margin:'4px 0',padding:'3px 0'}}><p style={{fontSize:13,fontWeight:700,color:ppColor(ppOurs)}}>{ppOurs>=0?'+':''}{ppOurs.toFixed(2)}pp</p>{pctOurs!==null&&<p style={{fontSize:10,color:ppColor(ppOurs)}}>({pctOurs>=0?'+':''}{pctOurs.toFixed(1)}%)</p>}</div>)}
                        {p.lyOurs!==null&&<><p style={{fontSize:13,fontWeight:700,color:"#c4c4c8"}}>Ours {lyYear}</p><p className="text-lg font-bold text-zinc-400">{p.lyOurs.toFixed(2)}%</p></>}
                      </div>
                      <div>
                        <p style={{fontSize:13,fontWeight:700,color:"#e4e4e7",marginBottom:4}}>Market {tyYear}</p>
                        <p className="text-xl font-bold text-white">{p.tyMkt.toFixed(2)}%</p>
                        {ppMkt!==null&&(<div style={{borderTop:'1px solid #3f3f46',margin:'4px 0',padding:'3px 0'}}><p style={{fontSize:13,fontWeight:700,color:ppColor(ppMkt)}}>{ppMkt>=0?'+':''}{ppMkt.toFixed(2)}pp</p>{pctMkt!==null&&<p style={{fontSize:10,color:ppColor(ppMkt)}}>({pctMkt>=0?'+':''}{pctMkt.toFixed(1)}%)</p>}</div>)}
                        {p.lyMkt!==null&&<><p style={{fontSize:13,fontWeight:700,color:"#c4c4c8"}}>Market {lyYear}</p><p className="text-lg font-bold text-zinc-500">{p.lyMkt.toFixed(2)}%</p></>}
                      </div>
                      {adjMkt!=null&&(
                        <div>
                          <p style={{fontSize:13,fontWeight:700,color:"#e4e4e7",marginBottom:4}}>Adj.Mkt {tyYear}</p>
                          <p className="text-xl font-bold" style={{color:p.adjColor}}>{adjMkt.toFixed(2)}%</p>
                          {ppAdjMkt!=null&&(<div style={{borderTop:'1px solid #3f3f46',margin:'4px 0',padding:'3px 0'}}><p style={{fontSize:13,fontWeight:700,color:ppColor(ppAdjMkt)}}>{ppAdjMkt>=0?'+':''}{ppAdjMkt.toFixed(2)}pp</p></div>)}
                          {p.lyMkt!==null&&<><p style={{fontSize:13,fontWeight:700,color:"#c4c4c8"}}>Adj.Mkt {lyYear}</p><p className="text-lg font-bold text-zinc-500">{p.lyMkt.toFixed(2)}%</p></>}
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 mt-2">{mode==='monthly'?`M${latestRealRow?.periodNumber}`:`W${latestRealRow?.periodNumber}`}/{tyYear}</p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Info bar — between pills and chart */}
          <FunnelInfoBar row={hovered2} tyYear={tyYear} lyYear={lyYear}/>

          {chartRows.length===0?(
            <div className="flex items-center justify-center h-64"><p className="text-zinc-300 text-sm font-semibold">Select a Brand or Family to load data</p></div>
          ):(
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={chartRowsWithAdj} margin={{top:5,right:30,left:20,bottom:5}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1F2937"/>
                <XAxis dataKey="label" tick={{fill:'#d4d4d8',fontSize:11}} axisLine={{stroke:'#374151'}} tickLine={false}/>
                <YAxis yAxisId="vol"  orientation="left"  tick={{fill:'#d4d4d8',fontSize:11}} axisLine={false} tickLine={false} tickFormatter={v=>v>=1000?`${(v/1000).toFixed(0)}K`:String(v)}/>
                <YAxis yAxisId="rate" orientation="right" tick={{fill:'#d4d4d8',fontSize:11}} axisLine={false} tickLine={false} tickFormatter={v=>`${v.toFixed(1)}%`} domain={[0,'auto']}/>
                <Tooltip content={tooltip2} cursor={{stroke:'#525252',strokeWidth:1}}/>
                <Legend wrapperStyle={{fontSize:'12px',paddingTop:'16px'}} formatter={v=><span style={{color:'#e4e4e7'}}>{v}</span>}/>
                <Bar yAxisId="vol" dataKey="ty_sv" name={`${tyYear} Vol`} fill="#2D4A6B" opacity={0.8} radius={[2,2,0,0]}/>
                <Bar yAxisId="vol" dataKey="ly_sv" name={`${lyYear} Vol`} fill="#3f3f46" opacity={0.6} radius={[2,2,0,0]}/>
                {singleKpi2?(
                  <>
                    <Line yAxisId="rate" type="monotone" dataKey={`ty_our${activeKpi2.toUpperCase()}`} name={`${tyYear} Ours`}   stroke={activeKpi2==='ctr'?'#06B6D4':activeKpi2==='atc'?'#F59E0B':'#8B5CF6'} strokeWidth={2.5} dot={false} connectNulls={false}/>
                    <Line yAxisId="rate" type="monotone" dataKey={`ty_mkt${activeKpi2.toUpperCase()}`} name={`${tyYear} Market`} stroke={activeKpi2==='ctr'?'#0E7490':activeKpi2==='atc'?'#B45309':'#6D28D9'} strokeWidth={2}   dot={false} strokeDasharray="5 3" connectNulls={false}/>
                    {priceAdjOn&&<Line yAxisId="rate" type="monotone" dataKey={`ty_adj${activeKpi2.toUpperCase()}`} name={`${tyYear} Adj.Mkt`} stroke={activeKpi2==='ctr'?'#67E8F9':activeKpi2==='atc'?'#FCD34D':'#C4B5FD'} strokeWidth={1.5} dot={false} strokeDasharray="2 2" connectNulls={false}/>}
                    <Line yAxisId="rate" type="monotone" dataKey={`ly_our${activeKpi2.toUpperCase()}`} name={`${lyYear} Ours`}   stroke={activeKpi2==='ctr'?'#06B6D4':activeKpi2==='atc'?'#F59E0B':'#8B5CF6'} strokeWidth={1.5} dot={false} strokeDasharray="4 4" opacity={0.5}/>
                    <Line yAxisId="rate" type="monotone" dataKey={`ly_mkt${activeKpi2.toUpperCase()}`} name={`${lyYear} Market`} stroke={activeKpi2==='ctr'?'#0E7490':activeKpi2==='atc'?'#B45309':'#6D28D9'} strokeWidth={1.5} dot={false} strokeDasharray="4 4" opacity={0.5}/>
                  </>
                ):(
                  <>
                    <Line yAxisId="rate" type="monotone" dataKey="ty_ourCTR" name={`${tyYear} CTR Ours`}   stroke="#06B6D4" strokeWidth={2}   dot={false} connectNulls={false}/>
                    <Line yAxisId="rate" type="monotone" dataKey="ty_mktCTR" name={`${tyYear} CTR Market`} stroke="#0E7490" strokeWidth={2}   dot={false} strokeDasharray="5 3" connectNulls={false}/>
                    {priceAdjOn&&<Line yAxisId="rate" type="monotone" dataKey="ty_adjCTR" name={`${tyYear} CTR Adj.Mkt`} stroke="#67E8F9" strokeWidth={1.5} dot={false} strokeDasharray="2 2" connectNulls={false}/>}
                    <Line yAxisId="rate" type="monotone" dataKey="ly_ourCTR" name={`${lyYear} CTR Ours`}   stroke="#06B6D4" strokeWidth={1.5} dot={false} strokeDasharray="4 4" opacity={0.5}/>
                    <Line yAxisId="rate" type="monotone" dataKey="ty_ourATC" name={`${tyYear} ATC Ours`}   stroke="#F59E0B" strokeWidth={2}   dot={false} connectNulls={false}/>
                    <Line yAxisId="rate" type="monotone" dataKey="ty_mktATC" name={`${tyYear} ATC Market`} stroke="#B45309" strokeWidth={2}   dot={false} strokeDasharray="5 3" connectNulls={false}/>
                    {priceAdjOn&&<Line yAxisId="rate" type="monotone" dataKey="ty_adjATC" name={`${tyYear} ATC Adj.Mkt`} stroke="#FCD34D" strokeWidth={1.5} dot={false} strokeDasharray="2 2" connectNulls={false}/>}
                    <Line yAxisId="rate" type="monotone" dataKey="ly_ourATC" name={`${lyYear} ATC Ours`}   stroke="#F59E0B" strokeWidth={1.5} dot={false} strokeDasharray="4 4" opacity={0.5}/>
                    <Line yAxisId="rate" type="monotone" dataKey="ty_ourCVR" name={`${tyYear} CVR Ours`}   stroke="#8B5CF6" strokeWidth={2}   dot={false} connectNulls={false}/>
                    <Line yAxisId="rate" type="monotone" dataKey="ty_mktCVR" name={`${tyYear} CVR Market`} stroke="#6D28D9" strokeWidth={2}   dot={false} strokeDasharray="5 3" connectNulls={false}/>
                    {priceAdjOn&&<Line yAxisId="rate" type="monotone" dataKey="ty_adjCVR" name={`${tyYear} CVR Adj.Mkt`} stroke="#C4B5FD" strokeWidth={1.5} dot={false} strokeDasharray="2 2" connectNulls={false}/>}
                    <Line yAxisId="rate" type="monotone" dataKey="ly_ourCVR" name={`${lyYear} CVR Ours`}   stroke="#8B5CF6" strokeWidth={1.5} dot={false} strokeDasharray="4 4" opacity={0.5}/>
                  </>
                )}
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ── SECTION 2 MODAL ── */}
        <DataModal open={modal2Open} onClose={()=>setModal2Open(false)} title="Conversion Funnel Rates YoY">
          <table style={{borderCollapse:'collapse',fontSize:11}}>
            <thead style={{position:'sticky',top:0,zIndex:2,background:'#18181b'}}>
              <tr><th rowSpan={2} style={{padding:'10px 14px',textAlign:'left',fontWeight:700,color:'#fff',borderBottom:HB}}>Period</th>{[{label:'CTR%',color:'#06b6d4'},{label:'ATC%',color:'#f59e0b'},{label:'CVR%',color:'#8b5cf6'}].map(g=>(<th key={g.label} colSpan={5} style={{background:'#1e1e22',padding:'7px 10px 5px',textAlign:'center',fontWeight:700,textTransform:'uppercase',borderBottom:HB,borderLeft:WB,color:g.color,whiteSpace:'nowrap'}}>{g.label}</th>))}</tr>
              <tr style={{background:'#1a1a1e',borderBottom:HB}}>{[0,1,2].map(i=>(<React.Fragment key={i}><th style={{padding:'5px 8px',textAlign:'center',fontWeight:700,color:'#facc15',borderLeft:WB,whiteSpace:'nowrap'}}>Ours {tyYear}</th><th style={{padding:'5px 8px',textAlign:'center',fontWeight:700,color:'#e4e4e7',whiteSpace:'nowrap'}}>Mkt {tyYear}</th><th style={{padding:'5px 8px',textAlign:'center',fontWeight:700,color:'#a1a1aa',whiteSpace:'nowrap'}}>Ours {lyYear}</th><th style={{padding:'5px 8px',textAlign:'center',fontWeight:700,color:'#71717a',whiteSpace:'nowrap'}}>Mkt {lyYear}</th><th style={{padding:'5px 8px',textAlign:'center',fontWeight:700,color:'#4ade80',whiteSpace:'nowrap'}}>YoY pp</th></React.Fragment>))}</tr>
            </thead>
            <tbody>
              {[...chartRows].reverse().filter(r=>!r.isFutureTY).map(row=>{
                const kpis=[{tyO:row.ty_ourCTR,tyM:row.ty_mktCTR,lyO:row.ly_ourCTR,lyM:row.ly_mktCTR},{tyO:row.ty_ourATC,tyM:row.ty_mktATC,lyO:row.ly_ourATC,lyM:row.ly_mktATC},{tyO:row.ty_ourCVR,tyM:row.ty_mktCVR,lyO:row.ly_ourCVR,lyM:row.ly_mktCVR}];
                return(<tr key={row.periodNumber} style={{borderBottom:RB}} onMouseEnter={e=>(e.currentTarget.style.background='#27272a')} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}><td style={{padding:'8px 14px',fontWeight:700,color:'#fff'}}>{row.label}</td>{kpis.map((k,i)=>{const{pp,pct}=yoyPP(k.tyO,k.lyO);const dColor=ppColor(pp);return(<React.Fragment key={i}><td style={{padding:'7px 10px',textAlign:'center',fontWeight:700,color:'#facc15',borderLeft:WB}}>{fmtPct(k.tyO)}</td><td style={{padding:'7px 10px',textAlign:'center',fontWeight:600,color:'#e4e4e7'}}>{fmtPct(k.tyM)}</td><td style={{padding:'7px 10px',textAlign:'center',fontWeight:600,color:'#a1a1aa'}}>{fmtPct(k.lyO)}</td><td style={{padding:'7px 10px',textAlign:'center',fontWeight:500,color:'#71717a'}}>{fmtPct(k.lyM)}</td><td style={{padding:'7px 10px',textAlign:'center',fontWeight:700,color:dColor}}>{pp!=null?`${pp>=0?'+':''}${pp.toFixed(2)}pp`:'—'}{pct!=null&&<div style={{fontSize:10,color:dColor}}>({pct>=0?'+':''}{pct.toFixed(1)}%)</div>}</td></React.Fragment>);})}</tr>);
              })}
            </tbody>
          </table>
        </DataModal>

        {/* ══ SECTION 3: MEDIAN PRICE TRACKING ══ */}
        <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-white">Median Price Tracking</h2>
              <p className="text-xs text-zinc-300 mt-0.5">Click · Cart Add · Purchase price — {tyYear} vs {lyYear}</p>
            </div>
            <div className="flex items-center gap-3 flex-wrap justify-end">
              <Toggle value={singleKpi3} onChange={setSingleKpi3} label="Single KPI"/>
              {singleKpi3&&(<div className="flex gap-1 bg-zinc-700 rounded-lg p-1">{([{key:'click',label:'Click Price',color:'#06B6D4'},{key:'atc',label:'Cart Add Price',color:'#F59E0B'},{key:'purchase',label:'Purchase Price',color:'#8B5CF6'}] as const).map(({key,label:lbl,color})=>(<button key={key} onClick={()=>setActiveKpi3(key)} className={`px-3 py-1.5 rounded text-sm font-semibold transition-colors ${activeKpi3===key?'bg-zinc-600':'text-zinc-400 hover:text-zinc-200'}`} style={activeKpi3===key?{color}:{}}>{lbl}</button>))}</div>)}
              <button onClick={()=>setModal3Open(true)} className="px-3 py-1.5 text-xs font-semibold text-orange-400 border border-zinc-600 rounded hover:border-orange-400 hover:text-orange-300">Show Data</button>
            </div>
          </div>

          {/* Price pills */}
          {ty&&(
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                {label:'Click Price',tyO:ty.ourClickPrice,tyM:ty.marketClickPrice,lyO:ly?.ourClickPrice??null,lyM:ly?.marketClickPrice??null},
                {label:'Cart Add Price',tyO:ty.ourCartPrice,tyM:ty.marketCartPrice,lyO:ly?.ourCartPrice??null,lyM:ly?.marketCartPrice??null},
                {label:'Purchase Price',tyO:ty.ourPurchasePrice,tyM:ty.marketPurchasePrice,lyO:ly?.ourPurchasePrice??null,lyM:ly?.marketPurchasePrice??null},
              ].map(p=>{
                const yoyO=p.tyO&&p.lyO&&p.lyO>0?p.tyO-p.lyO:null;
                const yoyOPct=yoyO!==null&&p.lyO&&p.lyO>0?(yoyO/p.lyO)*100:null;
                const yoyM=p.tyM&&p.lyM&&p.lyM>0?p.tyM-p.lyM:null;
                const yoyMPct=yoyM!==null&&p.lyM&&p.lyM>0?(yoyM/p.lyM)*100:null;
                return(
                  <div key={p.label} className="bg-zinc-700/50 border border-zinc-600 rounded-lg px-4 py-3">
                    <p style={{fontSize:15,fontWeight:800,color:"#ffffff",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>{p.label}</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p style={{fontSize:13,fontWeight:700,color:"#e4e4e7",marginBottom:4}}>Ours {tyYear}</p>
                        <p className="text-xl font-bold text-yellow-400">{fmtPrice(p.tyO)}</p>
                        {yoyO!==null&&(<div style={{borderTop:'1px solid #3f3f46',margin:'4px 0',padding:'3px 0'}}><p style={{fontSize:13,fontWeight:700,color:yoyO>=0?'#4ade80':'#f87171'}}>{yoyO>=0?'+':'-'}${Math.abs(yoyO).toFixed(2)}</p>{yoyOPct!==null&&<p style={{fontSize:10,color:yoyO>=0?'#4ade80':'#f87171'}}>({yoyOPct>=0?'+':''}{yoyOPct.toFixed(1)}%)</p>}</div>)}
                        {p.lyO!==null&&<><p style={{fontSize:13,fontWeight:700,color:"#c4c4c8"}}>Ours {lyYear}</p><p className="text-lg font-bold text-zinc-400">{fmtPrice(p.lyO)}</p></>}
                      </div>
                      <div>
                        <p style={{fontSize:13,fontWeight:700,color:"#e4e4e7",marginBottom:4}}>Market {tyYear}</p>
                        <p className="text-xl font-bold text-white">{fmtPrice(p.tyM)}</p>
                        {yoyM!==null&&(<div style={{borderTop:'1px solid #3f3f46',margin:'4px 0',padding:'3px 0'}}><p style={{fontSize:13,fontWeight:700,color:yoyM>=0?'#4ade80':'#f87171'}}>{yoyM>=0?'+':'-'}${Math.abs(yoyM).toFixed(2)}</p>{yoyMPct!==null&&<p style={{fontSize:10,color:yoyM>=0?'#4ade80':'#f87171'}}>({yoyMPct>=0?'+':''}{yoyMPct.toFixed(1)}%)</p>}</div>)}
                        {p.lyM!==null&&<><p style={{fontSize:13,fontWeight:700,color:"#c4c4c8"}}>Market {lyYear}</p><p className="text-lg font-bold text-zinc-500">{fmtPrice(p.lyM)}</p></>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Info bar — between pills and chart */}
          <PriceInfoBar row={hovered3} tyYear={tyYear} lyYear={lyYear}/>

          {chartRows.length===0?(
            <div className="flex items-center justify-center h-64"><p className="text-zinc-300 text-sm font-semibold">Select a Brand or Family to load data</p></div>
          ):(
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={chartRows} margin={{top:5,right:30,left:20,bottom:5}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" vertical={false}/>
                <XAxis dataKey="label" tick={{fontSize:11,fill:'#d4d4d8'}} tickLine={false} axisLine={{stroke:'#3f3f46'}}/>
                <YAxis yAxisId="vol"   orientation="left"  tickFormatter={n=>n>=1000?`${(n/1000).toFixed(0)}K`:String(n)} tick={{fontSize:11,fill:'#d4d4d8'}} tickLine={false} axisLine={false}/>
                <YAxis yAxisId="price" orientation="right" tickFormatter={n=>`$${n.toFixed(0)}`} tick={{fontSize:11,fill:'#d4d4d8'}} tickLine={false} axisLine={false}/>
                <Tooltip content={tooltip3} cursor={{stroke:'#525252',strokeWidth:1}}/>
                <Legend wrapperStyle={{fontSize:'11px',paddingTop:'12px'}} formatter={v=><span style={{color:'#e4e4e7'}}>{v}</span>}/>
                <Bar yAxisId="vol" dataKey="ty_sv" name={`${tyYear} Vol`} fill="#3b82f6" opacity={0.4} radius={[2,2,0,0]}/>
                <Bar yAxisId="vol" dataKey="ly_sv" name={`${lyYear} Vol`} fill="#3f3f46" opacity={0.5} radius={[2,2,0,0]}/>
                {singleKpi3?(
                  <>
                    {activeKpi3==='click'&&<><Line yAxisId="price" type="monotone" dataKey="ty_ourClickPx" name={`${tyYear} Click Ours`}   stroke="#06B6D4" strokeWidth={2.5} dot={false} connectNulls={false}/><Line yAxisId="price" type="monotone" dataKey="ty_mktClickPx" name={`${tyYear} Click Market`} stroke="#0E7490" strokeWidth={2} dot={false} strokeDasharray="5 3" connectNulls={false}/><Line yAxisId="price" type="monotone" dataKey="ly_ourClickPx" name={`${lyYear} Click Ours`}   stroke="#06B6D4" strokeWidth={1.5} dot={false} strokeDasharray="4 4" opacity={0.5}/><Line yAxisId="price" type="monotone" dataKey="ly_mktClickPx" name={`${lyYear} Click Market`} stroke="#0E7490" strokeWidth={1.5} dot={false} strokeDasharray="4 4" opacity={0.5}/></>}
                    {activeKpi3==='atc'&&<><Line yAxisId="price" type="monotone" dataKey="ty_ourCartPx" name={`${tyYear} Cart Ours`}   stroke="#F59E0B" strokeWidth={2.5} dot={false} connectNulls={false}/><Line yAxisId="price" type="monotone" dataKey="ty_mktCartPx" name={`${tyYear} Cart Market`} stroke="#B45309" strokeWidth={2} dot={false} strokeDasharray="5 3" connectNulls={false}/><Line yAxisId="price" type="monotone" dataKey="ly_ourCartPx" name={`${lyYear} Cart Ours`}   stroke="#F59E0B" strokeWidth={1.5} dot={false} strokeDasharray="4 4" opacity={0.5}/><Line yAxisId="price" type="monotone" dataKey="ly_mktCartPx" name={`${lyYear} Cart Market`} stroke="#B45309" strokeWidth={1.5} dot={false} strokeDasharray="4 4" opacity={0.5}/></>}
                    {activeKpi3==='purchase'&&<><Line yAxisId="price" type="monotone" dataKey="ty_ourPurPx" name={`${tyYear} Pur Ours`}   stroke="#8B5CF6" strokeWidth={2.5} dot={false} connectNulls={false}/><Line yAxisId="price" type="monotone" dataKey="ty_mktPurPx" name={`${tyYear} Pur Market`} stroke="#6D28D9" strokeWidth={2} dot={false} strokeDasharray="5 3" connectNulls={false}/><Line yAxisId="price" type="monotone" dataKey="ly_ourPurPx" name={`${lyYear} Pur Ours`}   stroke="#8B5CF6" strokeWidth={1.5} dot={false} strokeDasharray="4 4" opacity={0.5}/><Line yAxisId="price" type="monotone" dataKey="ly_mktPurPx" name={`${lyYear} Pur Market`} stroke="#6D28D9" strokeWidth={1.5} dot={false} strokeDasharray="4 4" opacity={0.5}/></>}
                  </>
                ):(
                  <>
                    <Line yAxisId="price" type="monotone" dataKey="ty_ourClickPx" name={`${tyYear} Click Ours`}   stroke="#06B6D4" strokeWidth={2}   dot={false} connectNulls={false}/>
                    <Line yAxisId="price" type="monotone" dataKey="ty_mktClickPx" name={`${tyYear} Click Market`} stroke="#0E7490" strokeWidth={2}   dot={false} strokeDasharray="5 3" connectNulls={false}/>
                    <Line yAxisId="price" type="monotone" dataKey="ly_ourClickPx" name={`${lyYear} Click Ours`}   stroke="#06B6D4" strokeWidth={1.5} dot={false} strokeDasharray="4 4" opacity={0.5}/>
                    <Line yAxisId="price" type="monotone" dataKey="ty_ourPurPx"   name={`${tyYear} Pur Ours`}     stroke="#8B5CF6" strokeWidth={2}   dot={false} connectNulls={false}/>
                    <Line yAxisId="price" type="monotone" dataKey="ty_mktPurPx"   name={`${tyYear} Pur Market`}   stroke="#6D28D9" strokeWidth={2}   dot={false} strokeDasharray="5 3" connectNulls={false}/>
                    <Line yAxisId="price" type="monotone" dataKey="ly_ourPurPx"   name={`${lyYear} Pur Ours`}     stroke="#8B5CF6" strokeWidth={1.5} dot={false} strokeDasharray="4 4" opacity={0.5}/>
                  </>
                )}
              </ComposedChart>
            </ResponsiveContainer>
          )}
          <p className="text-xs text-zinc-400 mt-2">Solid = {tyYear} · Dashed = {lyYear}</p>
        </div>

        {/* ── SECTION 3 MODAL ── */}
        <DataModal open={modal3Open} onClose={()=>setModal3Open(false)} title="Median Price Tracking YoY">
          <table style={{borderCollapse:'collapse',fontSize:11}}>
            <thead style={{position:'sticky',top:0,zIndex:2,background:'#18181b'}}>
              <tr><th rowSpan={2} style={{padding:'10px 14px',textAlign:'left',fontWeight:700,color:'#fff',borderBottom:HB}}>Period</th>{[{label:'Click Price',color:'#06b6d4'},{label:'Cart Add Price',color:'#f59e0b'},{label:'Purchase Price',color:'#8b5cf6'}].map(g=>(<th key={g.label} colSpan={5} style={{background:'#1e1e22',padding:'7px 10px 5px',textAlign:'center',fontWeight:700,textTransform:'uppercase',borderBottom:HB,borderLeft:WB,color:g.color,whiteSpace:'nowrap'}}>{g.label}</th>))}</tr>
              <tr style={{background:'#1a1a1e',borderBottom:HB}}>{[0,1,2].map(i=>(<React.Fragment key={i}><th style={{padding:'5px 8px',textAlign:'center',fontWeight:700,color:'#facc15',borderLeft:WB,whiteSpace:'nowrap'}}>Ours {tyYear}</th><th style={{padding:'5px 8px',textAlign:'center',fontWeight:700,color:'#e4e4e7',whiteSpace:'nowrap'}}>Mkt {tyYear}</th><th style={{padding:'5px 8px',textAlign:'center',fontWeight:700,color:'#a1a1aa',whiteSpace:'nowrap'}}>Ours {lyYear}</th><th style={{padding:'5px 8px',textAlign:'center',fontWeight:700,color:'#71717a',whiteSpace:'nowrap'}}>Mkt {lyYear}</th><th style={{padding:'5px 8px',textAlign:'center',fontWeight:700,color:'#4ade80',whiteSpace:'nowrap'}}>YoY $</th></React.Fragment>))}</tr>
            </thead>
            <tbody>
              {[...chartRows].reverse().filter(r=>!r.isFutureTY).map(row=>{
                const pks=[{tyO:row.ty_ourClickPx,tyM:row.ty_mktClickPx,lyO:row.ly_ourClickPx,lyM:row.ly_mktClickPx},{tyO:row.ty_ourCartPx,tyM:row.ty_mktCartPx,lyO:row.ly_ourCartPx,lyM:row.ly_mktCartPx},{tyO:row.ty_ourPurPx,tyM:row.ty_mktPurPx,lyO:row.ly_ourPurPx,lyM:row.ly_mktPurPx}];
                return(<tr key={row.periodNumber} style={{borderBottom:RB}} onMouseEnter={e=>(e.currentTarget.style.background='#27272a')} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}><td style={{padding:'8px 14px',fontWeight:700,color:'#fff'}}>{row.label}</td>{pks.map((k,i)=>{const diff=k.tyO!==null&&k.lyO!==null?k.tyO-k.lyO:null;const dColor=diff==null?'#71717a':Math.abs(diff)<0.001?'#71717a':diff>0?'#4ade80':'#f87171';return(<React.Fragment key={i}><td style={{padding:'7px 10px',textAlign:'center',fontWeight:700,color:'#facc15',borderLeft:WB}}>{fmtPrice(k.tyO)}</td><td style={{padding:'7px 10px',textAlign:'center',fontWeight:600,color:'#e4e4e7'}}>{fmtPrice(k.tyM)}</td><td style={{padding:'7px 10px',textAlign:'center',fontWeight:600,color:'#a1a1aa'}}>{fmtPrice(k.lyO)}</td><td style={{padding:'7px 10px',textAlign:'center',fontWeight:500,color:'#71717a'}}>{fmtPrice(k.lyM)}</td><td style={{padding:'7px 10px',textAlign:'center',fontWeight:700,color:dColor}}>{diff!==null?`${diff>=0?'+':'-'}$${Math.abs(diff).toFixed(2)}`:'—'}</td></React.Fragment>);})}</tr>);
              })}
            </tbody>
          </table>
        </DataModal>

      </div>
    </div>
  );
}