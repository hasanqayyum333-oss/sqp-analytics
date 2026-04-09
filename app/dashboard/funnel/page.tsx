'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { generateWeeks, generateMonths } from '../filter-context';
import type { WeekOption, MonthOption } from '../filter-context';

const ALL_WEEKS   = generateWeeks();
const ALL_MONTHS  = generateMonths();
const DEFAULT_END_WEEK    = ALL_WEEKS[0];
const DEFAULT_START_WEEK  = ALL_WEEKS[Math.min(29, ALL_WEEKS.length - 1)];
const DEFAULT_END_MONTH   = ALL_MONTHS[0];
const DEFAULT_START_MONTH = ALL_MONTHS[Math.min(11, ALL_MONTHS.length - 1)];

// ─── TYPES ────────────────────────────────────────────────────────────────────
type WeekRow = {
  weekKey: string; weekEnd: string; weekNumber: number; year: number;
  searchVolume: number;
  mktImpressions: number; ourImpressions: number; impressionShare: number;
  mktClicks: number; ourClicks: number; clickShare: number; mktCTR: number; ourCTR: number;
  mktCartAdds: number; ourCartAdds: number; cartAddShare: number; mktATC: number; ourATC: number;
  mktPurchases: number; ourPurchases: number; purchaseShare: number; mktCVR: number; ourCVR: number;
  mktRevenue: number; ourRevenue: number; revenueShare: number;
};
type AdsRow = {
  dateKey: string; weekNumber: number;
  impressions: number; clicks: number; spend: number; sales: number; orders: number;
  ctr: number; cvr: number; acos: number; roas: number; cpc: number;
} | null;
type Opt      = { value: string; label: string };
type AsinOpt  = Opt & { family: string };
type AdType   = 'both' | 'sp' | 'sb';
type ViewMode = 'search_term' | 'keyword';

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
function fmtCcyExact(n: number) { return `$${n.toFixed(2)}`; }
function wowPct(curr: number, prev: number): { val: string; pos: boolean } | null {
  if (!prev) return null;
  const p = ((curr - prev) / Math.abs(prev)) * 100;
  return { val: `${p >= 0 ? '+' : ''}${p.toFixed(1)}%`, pos: p >= 0 };
}
function wowPP(curr: number, prev: number): { val: string; pos: boolean } {
  const pp = curr - prev;
  return { val: `${pp >= 0 ? '+' : ''}${Math.abs(pp).toFixed(2)}pp`, pos: pp >= 0 };
}
function wowPctFromPP(curr: number, prev: number): { val: string; pos: boolean } | null {
  if (!prev) return null;
  const p = ((curr - prev) / Math.abs(prev)) * 100;
  return { val: `(${p >= 0 ? '+' : ''}${p.toFixed(1)}%)`, pos: p >= 0 };
}
function adTypeToArray(t: AdType): string[] {
  return t === 'both' ? ['SP','SB'] : t === 'sp' ? ['SP'] : ['SB'];
}

// ─── DROPDOWNS ────────────────────────────────────────────────────────────────
function BrandSelect({ opts, value, onChange }: { opts: Opt[]; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false); const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch(''); } }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);
  const filtered = opts.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));
  const label = opts.find(o => o.value === value)?.label ?? value ?? 'Brand';
  return (
    <div ref={ref} className="relative">
      <label className="block text-xs font-bold text-white mb-1 uppercase tracking-wide">Brand</label>
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 border rounded-lg px-3 py-2 text-sm min-w-[140px] bg-zinc-800 border-zinc-700 text-white hover:border-zinc-500 cursor-pointer">
        <span className="flex-1 text-left truncate">{label}</span>
        <svg className={`w-4 h-4 text-zinc-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (<div className="absolute z-50 w-64 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl"><div className="p-2 border-b border-zinc-700"><input autoFocus type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="w-full bg-zinc-700 border border-zinc-600 rounded px-2 py-1.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-orange-400" /></div><div className="overflow-y-auto max-h-60">{filtered.map(opt => (<div key={opt.value} onClick={() => { onChange(opt.value); setOpen(false); setSearch(''); }} className={`px-3 py-2 cursor-pointer hover:bg-zinc-700 text-sm ${value === opt.value ? 'text-orange-400 bg-orange-500/10' : 'text-zinc-200'}`}>{opt.label}</div>))}</div></div>)}
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
      <button onClick={() => !disabled && setOpen(o => !o)} disabled={disabled} className={`flex items-center gap-2 border rounded-lg px-3 py-2 text-sm min-w-[140px] ${disabled ? 'bg-zinc-900 border-zinc-800 text-zinc-600 cursor-not-allowed' : 'bg-zinc-800 border-zinc-700 text-white hover:border-zinc-500 cursor-pointer'}`}>
        <span className={`flex-1 text-left truncate ${value.length === 0 ? 'text-zinc-400' : ''}`}>{displayText}</span>
        <svg className={`w-4 h-4 text-zinc-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (<div className="absolute z-50 w-72 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl"><div className="p-2 border-b border-zinc-700"><input autoFocus type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="w-full bg-zinc-700 border border-zinc-600 rounded px-2 py-1.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-orange-400" /></div>{value.length > 0 && <div className="px-3 py-1.5 border-b border-zinc-700 flex gap-3"><button onClick={() => onChange([])} className="text-xs text-orange-400 hover:text-orange-300">Clear all</button></div>}<div className="overflow-y-auto max-h-60">{filtered.map(opt => (<div key={opt.value} onClick={() => toggle(opt.value)} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-zinc-700"><div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${value.includes(opt.value) ? 'bg-orange-500 border-orange-500' : 'border-zinc-600'}`}>{value.includes(opt.value) && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}</div><span className="text-sm text-zinc-200 truncate">{opt.label}</span></div>))}</div></div>)}
    </div>
  );
}

function KeywordSel({ opts, value, onChange, disabled }: { opts: string[]; value: string | null; onChange: (v: string | null) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false); const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch(''); } }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);
  const filtered = opts.filter(k => k.toLowerCase().includes(search.toLowerCase()));
  return (
    <div ref={ref} className="relative">
      <label className="block text-xs font-bold text-white mb-1 uppercase tracking-wide">Keyword</label>
      <button onClick={() => !disabled && setOpen(o => !o)} disabled={disabled} className={`flex items-center gap-2 border rounded-lg px-3 py-2 text-sm min-w-[200px] ${disabled ? 'bg-zinc-900 border-zinc-800 text-zinc-600 cursor-not-allowed' : 'bg-zinc-800 border-zinc-700 text-white hover:border-zinc-500 cursor-pointer'}`}>
        <span className={`flex-1 text-left truncate ${!value ? 'text-zinc-400' : ''}`}>{value ?? 'All tracked keywords'}</span>
        <svg className={`w-4 h-4 text-zinc-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (<div className="absolute z-50 w-80 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl"><div className="p-2 border-b border-zinc-700"><input autoFocus type="text" placeholder="Search keywords..." value={search} onChange={e => setSearch(e.target.value)} className="w-full bg-zinc-700 border border-zinc-600 rounded px-2 py-1.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-orange-400" /></div><div className="overflow-y-auto max-h-64"><div onClick={() => { onChange(null); setOpen(false); setSearch(''); }} className={`px-3 py-2 cursor-pointer hover:bg-zinc-700 text-sm italic ${!value ? 'text-orange-400 bg-orange-500/10' : 'text-zinc-400'}`}>All tracked keywords</div>{filtered.map(kw => (<div key={kw} onClick={() => { onChange(kw); setOpen(false); setSearch(''); }} className={`px-3 py-2 cursor-pointer hover:bg-zinc-700 text-sm ${value === kw ? 'text-orange-400 bg-orange-500/10' : 'text-zinc-200'}`}>{kw}</div>))}</div></div>)}
    </div>
  );
}

function WeekDropdown({ label, value, onChange, maxWeek }: { label: string; value: WeekOption; onChange: (w: WeekOption) => void; maxWeek?: WeekOption }) {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);
  const available = maxWeek ? ALL_WEEKS.filter(w => w.start >= maxWeek!.start) : ALL_WEEKS;
  return (
    <div ref={ref} className="relative">
      <div className="text-xs font-bold text-white mb-1">{label}</div>
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 bg-zinc-700 border border-zinc-600 text-white text-xs rounded px-3 py-1.5 hover:border-zinc-500 min-w-[180px]">
        <span className="flex-1 text-left truncate">{value.shortLabel}</span>
        <svg className={`w-3 h-3 text-zinc-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (<div className="absolute z-50 mt-1 w-full min-w-[220px] bg-zinc-700 border border-zinc-600 rounded shadow-xl overflow-hidden"><div className="overflow-y-auto max-h-52">{available.map(w => (<div key={w.start} onClick={() => { onChange(w); setOpen(false); }} className={`px-3 py-1.5 text-xs cursor-pointer ${w.start === value.start ? 'bg-orange-500 text-white' : 'text-zinc-200 hover:bg-zinc-600'}`}>{w.label}</div>))}</div></div>)}
    </div>
  );
}

function MonthDropdown({ label, value, onChange, maxMonth }: { label: string; value: MonthOption; onChange: (m: MonthOption) => void; maxMonth?: MonthOption }) {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);
  const available = maxMonth ? ALL_MONTHS.filter(m => m.start >= maxMonth!.start) : ALL_MONTHS;
  return (
    <div ref={ref} className="relative">
      <div className="text-xs font-bold text-white mb-1">{label}</div>
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 bg-zinc-700 border border-zinc-600 text-white text-xs rounded px-3 py-1.5 hover:border-zinc-500 min-w-[160px]">
        <span className="flex-1 text-left truncate">{value.label}</span>
        <svg className={`w-3 h-3 text-zinc-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (<div className="absolute z-50 mt-1 w-full min-w-[180px] bg-zinc-700 border border-zinc-600 rounded shadow-xl overflow-hidden"><div className="overflow-y-auto max-h-52">{available.map(m => (<div key={m.start} onClick={() => { onChange(m); setOpen(false); }} className={`px-3 py-1.5 text-xs cursor-pointer ${m.start === value.start ? 'bg-orange-500 text-white' : 'text-zinc-200 hover:bg-zinc-600'}`}>{m.label}</div>))}</div></div>)}
    </div>
  );
}

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

// ─── DONUT RING ───────────────────────────────────────────────────────────────
const DONUT_TRACK: Record<string, string> = {
  '#3b82f6': '#1e3a5f', '#06b6d4': '#164e63', '#f97316': '#7c2d12',
  '#a855f7': '#581c87', '#22c55e': '#14532d',
};

// ─── SQP PILL ─────────────────────────────────────────────────────────────────
function SqpPill({ title, color, ring, stats }: {
  title: string; color: string;
  ring: { share: number; count: string; pct: string };
  stats: { label: string; value: string; change?: { val: string; pos: boolean } | null }[];
}) {
  const r = 40; const circ = 2 * Math.PI * r;
  const arc = Math.min(Math.max((ring.share / 100) * circ, 0), circ - 0.5);
  const track = DONUT_TRACK[color] ?? '#3f3f46';
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 flex flex-col items-center gap-3 flex-1">
      <p className="text-xs font-bold text-white tracking-widest uppercase text-center">{title}</p>
      <div className="relative" style={{ width: 100, height: 100, flexShrink: 0 }}>
        <svg width="100" height="100" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={r} fill="none" stroke={track} strokeWidth="11" />
          {arc > 0 && <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="11"
            strokeDasharray={`${arc.toFixed(2)} ${(circ - arc).toFixed(2)}`} strokeDashoffset="0" transform="rotate(-90 50 50)" />}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span style={{ fontSize: 15, fontWeight: 800, color: '#fff', lineHeight: 1.1 }}>{ring.count}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color, marginTop: 2 }}>{ring.pct}</span>
        </div>
      </div>
      <div className="w-full flex-1 flex flex-col justify-start">
        {stats.map((s, i) => (
          <div key={i} className="flex items-start justify-between gap-2 py-1.5"
            style={{ borderBottom: i < stats.length - 1 ? '1px solid rgba(255,255,255,0.08)' : undefined }}>
            <span className="text-zinc-200 text-xs font-semibold leading-tight whitespace-nowrap">{s.label}</span>
            <div className="text-right">
              <div className="text-white text-sm font-bold">{s.value}</div>
              {s.change && <div className={`text-xs font-semibold ${s.change.pos ? 'text-green-400' : 'text-red-400'}`}>{s.change.pos ? '↑' : '↓'} {s.change.val}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── ADS PILL ─────────────────────────────────────────────────────────────────
interface AdsPillProps {
  label: string; value: string; subColor?: string;
  delta1?: { val: string; pos: boolean } | null;
  delta2?: { val: string; pos: boolean } | null;
  invertColor?: boolean;
}
function AdsPill({ label, value, subColor, delta1, delta2, invertColor }: AdsPillProps) {
  const getColor = (pos: boolean) => invertColor ? (pos ? 'text-red-400' : 'text-green-400') : (pos ? 'text-green-400' : 'text-red-400');
  return (
    <div className="bg-zinc-700/60 border border-zinc-600 rounded-xl px-4 py-3 flex flex-col gap-1 flex-1">
      <p className="text-xs font-bold text-zinc-300 uppercase tracking-widest">{label}</p>
      <p className="text-xl font-bold" style={{ color: subColor ?? '#fff' }}>{value}</p>
      {delta1 && (
        <p className={`text-xs font-semibold ${getColor(delta1.pos)}`}>
          {delta1.pos ? '↑' : '↓'} {delta1.val}
          {delta2 && <span className="opacity-80 ml-1">{delta2.val}</span>}
        </p>
      )}
    </div>
  );
}

// ─── ADS KPI SECTION ─────────────────────────────────────────────────────────
interface AdsKpiSectionProps {
  brands: string[]; families: string[];
  viewMode: ViewMode; filterValue: string | null;
  mode: 'weekly' | 'monthly'; sectionLabel: string; adTypes: string[];
}
function AdsKpiSection({ brands, families, viewMode, filterValue, mode, sectionLabel, adTypes }: AdsKpiSectionProps) {
  const [curr, setCurr] = useState<AdsRow>(null);
  const [prev, setPrev] = useState<AdsRow>(null);
  const [loading, setLoading] = useState(false);
  const lastGoodCurr = useRef<AdsRow>(null);
  const lastGoodPrev = useRef<AdsRow>(null);

  const fetchAds = useCallback(async () => {
    if (!brands.length && !families.length) return;
    setLoading(true);
    try {
      const res = await fetch('/api/dashboard/ads', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brands, families, adTypes, viewMode, filterValue, mode }),
      });
      const d = await res.json();
      const nc = d.current ?? null; const np = d.previous ?? null;
      setCurr(nc); setPrev(np);
      if (nc) { lastGoodCurr.current = nc; lastGoodPrev.current = np; }
    } catch { /* keep last good */ }
    finally { setLoading(false); }
  }, [brands, families, adTypes, viewMode, filterValue, mode]);

  useEffect(() => { fetchAds(); }, [fetchAds]);

  const c = loading ? (lastGoodCurr.current ?? curr) : curr;
  const p = loading ? (lastGoodPrev.current ?? prev) : prev;

  if (!c) {
    if (loading) return (<div className="flex items-center gap-2 py-4"><div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /><span className="text-xs text-zinc-400">Loading {sectionLabel} data...</span></div>);
    return <div className="py-4 text-center text-sm text-zinc-500">No {sectionLabel} data for this selection.</div>;
  }

  const dc = (a: number, b: number) => { if (!b) return null; const pct = ((a-b)/Math.abs(b))*100; return { val: `${pct>=0?'+':''}${pct.toFixed(1)}%`, pos: pct>=0 }; };
  const dAbs = (a: number, b: number|undefined) => { if (b==null) return null; const d = a-b; return { val: `${d>=0?'+':''}${fmtCcyExact(Math.abs(d))}`, pos: d>=0 }; };
  const dPP  = (a: number, b: number|undefined) => { if (b==null) return null; const pp = a-b; return { val: `${pp>=0?'+':''}${Math.abs(pp).toFixed(2)}pp`, pos: pp>=0 }; };

  const periodLabel = mode === 'weekly' ? (c.weekNumber ? `W${c.weekNumber} — Latest` : 'Latest week') : 'Latest month';

  const row1: AdsPillProps[] = [
    { label: 'Impressions', value: fmtK(c.impressions),  delta1: dc(c.impressions, p?.impressions ?? 0) },
    { label: 'Clicks',      value: fmtK(c.clicks),       delta1: dc(c.clicks,      p?.clicks      ?? 0) },
    { label: 'Orders',      value: fmtK(c.orders),       delta1: dc(c.orders,      p?.orders      ?? 0) },
    { label: 'Spend',       value: fmtCcy(c.spend),      subColor: '#facc15', delta1: dAbs(c.spend, p?.spend), delta2: dc(c.spend, p?.spend ?? 0) },
    { label: 'Sales',       value: fmtCcy(c.sales),      subColor: '#4ade80', delta1: dAbs(c.sales, p?.sales), delta2: dc(c.sales, p?.sales ?? 0) },
  ];
  const row2: AdsPillProps[] = [
    { label: 'CPC',   value: fmtCcyExact(c.cpc),   subColor: '#facc15', delta1: dAbs(c.cpc, p?.cpc), delta2: dc(c.cpc, p?.cpc ?? 0) },
    { label: 'CTR%',  value: `${c.ctr.toFixed(2)}%`,  delta1: dPP(c.ctr,  p?.ctr),  delta2: dc(c.ctr,  p?.ctr  ?? 0) },
    { label: 'CVR%',  value: `${c.cvr.toFixed(2)}%`,  delta1: dPP(c.cvr,  p?.cvr),  delta2: dc(c.cvr,  p?.cvr  ?? 0) },
    { label: 'ACoS%', value: `${c.acos.toFixed(2)}%`, delta1: dPP(c.acos, p?.acos), delta2: dc(c.acos, p?.acos ?? 0), invertColor: true },
    { label: 'ROAS',  value: c.roas.toFixed(2),        delta1: dc(c.roas, p?.roas ?? 0) },
  ];

  return (
    <div className="space-y-3" style={{ position: 'relative', opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s' }}>
      {loading && <div style={{ position: 'absolute', top: 0, right: 0 }}><div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>}
      <div className="flex items-center gap-2">
        <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{sectionLabel}</p>
        <span className="text-xs text-zinc-500">{periodLabel}</span>
      </div>
      <div className="flex gap-3">{row1.map((pill, i) => <AdsPill key={i} {...pill} />)}</div>
      <div className="flex gap-3">{row2.map((pill, i) => <AdsPill key={i} {...pill} />)}</div>
    </div>
  );
}

// ─── MODAL DRAG HOOK ──────────────────────────────────────────────────────────
type ResizeState = { active: boolean; dir: string; startX: number; startY: number; startW: number; startH: number; startL: number; startT: number } | null;

function useModalDrag(widthFraction: number, initialH: number) {
  const [dims, setDims] = useState({ w: 0, h: initialH, l: 0, t: 0, ready: false });
  const modalRef    = useRef<HTMLDivElement>(null);
  const resizingRef = useRef<ResizeState>(null);
  const minW        = useRef(0);

  useEffect(() => {
    if (!dims.ready && typeof window !== 'undefined') {
      const w = Math.round(window.innerWidth * widthFraction);
      minW.current = w;
      setDims({ w, h: initialH, l: Math.round((window.innerWidth - w) / 2), t: Math.round((window.innerHeight - initialH) / 2), ready: true });
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
      const MIN_W = minW.current; const MIN_H = 300;
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

  const startAction = (e: React.MouseEvent, dir: string) => {
    e.preventDefault(); e.stopPropagation();
    const el = modalRef.current; if (!el) return;
    resizingRef.current = { active: true, dir, startX: e.clientX, startY: e.clientY,
      startW: parseFloat(el.style.width) || dims.w, startH: parseFloat(el.style.height) || dims.h,
      startL: parseFloat(el.style.left)  || dims.l, startT: parseFloat(el.style.top)   || dims.t };
  };

  return { dims, modalRef, minW, startAction };
}

// ─── DATA MODAL ───────────────────────────────────────────────────────────────
function DataModal({ brand, families, asins, keyword, onClose, mode }: {
  brand: string; families: string[]; asins: string[];
  keyword: string | null; onClose: () => void; mode: 'weekly' | 'monthly';
}) {
  const isMonthly = mode === 'monthly';
  const [modalStart, setModalStart] = useState<WeekOption | MonthOption>(isMonthly ? DEFAULT_START_MONTH : DEFAULT_START_WEEK);
  const [modalEnd,   setModalEnd]   = useState<WeekOption | MonthOption>(isMonthly ? DEFAULT_END_MONTH   : DEFAULT_END_WEEK);
  const [sqpData,    setSqpData]    = useState<WeekRow[]>([]);
  const [adsDataMap, setAdsDataMap] = useState<Map<string, AdsRow>>(new Map());
  const [loadingSqp, setLoadingSqp] = useState(false);
  const [loadingAds, setLoadingAds] = useState(false);
  const [modalAdType,   setModalAdType]   = useState<AdType>('both');
  const [modalViewMode, setModalViewMode] = useState<ViewMode>('search_term');
  const [expandedKpis,  setExpandedKpis]  = useState<Set<string>>(new Set());
  const toggleKpi = (k: string) => setExpandedKpis(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const { dims, modalRef, minW, startAction } = useModalDrag(0.50, 540);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h); return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  const fetchSqp = useCallback(async () => {
    setLoadingSqp(true);
    try {
      const endVal = (modalEnd as WeekOption).end ?? (modalEnd as MonthOption).end;
      const res = await fetch('/api/dashboard/funnel', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brands: brand ? [brand] : [], families, asins, keyword, mode, startDate: modalStart.start, endDate: endVal }),
      });
      const d = await res.json();
      setSqpData(d.data ?? []);
    } catch { setSqpData([]); }
    finally { setLoadingSqp(false); }
  }, [brand, families, asins, keyword, mode, modalStart, modalEnd]);

  useEffect(() => { fetchSqp(); }, [fetchSqp]);

  const fetchAds = useCallback(async () => {
    if (!sqpData.length) return;
    setLoadingAds(true);
    try {
      const endVal = (modalEnd as WeekOption).end ?? (modalEnd as MonthOption).end;
      const res = await fetch('/api/dashboard/ads', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brands: brand ? [brand] : [], families, adTypes: adTypeToArray(modalAdType), viewMode: modalViewMode, filterValue: keyword, mode, allWeeks: true, startDate: modalStart.start, endDate: endVal }),
      });
      const d = await res.json();
      const map = new Map<string, AdsRow>();
      if (d.weeks) { for (const w of d.weeks) map.set(w.dateKey, w); }
      else if (d.current) { map.set(d.current.dateKey, d.current); }
      setAdsDataMap(map);
    } catch { setAdsDataMap(new Map()); }
    finally { setLoadingAds(false); }
  }, [brand, families, keyword, mode, modalStart, modalEnd, modalAdType, modalViewMode, sqpData]);

  useEffect(() => { fetchAds(); }, [fetchAds]);

  if (!dims.ready) return null;

  const rows = [...sqpData].reverse();
  const edge = (s: React.CSSProperties): React.CSSProperties => ({ position: 'absolute', zIndex: 10, ...s });
  const E = 6;
  const WB = '2px solid rgba(255,255,255,0.20)';
  const HB = '2px solid rgba(255,255,255,0.25)';
  const RB = '1px solid rgba(255,255,255,0.10)';
  const YELLOW = '#facc15';

  const SQP_KPIS = [
    { key: 'imp',  label: 'Impressions', color: '#6366f1', shareKey: 'impressionShare' as keyof WeekRow, mktKey: 'mktImpressions' as keyof WeekRow, oursKey: 'ourImpressions' as keyof WeekRow, isCcy: false },
    { key: 'clk',  label: 'Clicks',      color: '#06b6d4', shareKey: 'clickShare'      as keyof WeekRow, mktKey: 'mktClicks'       as keyof WeekRow, oursKey: 'ourClicks'       as keyof WeekRow, isCcy: false },
    { key: 'cart', label: 'Cart Adds',   color: '#f97316', shareKey: 'cartAddShare'    as keyof WeekRow, mktKey: 'mktCartAdds'     as keyof WeekRow, oursKey: 'ourCartAdds'     as keyof WeekRow, isCcy: false },
    { key: 'pur',  label: 'Purchases',   color: '#a855f7', shareKey: 'purchaseShare'   as keyof WeekRow, mktKey: 'mktPurchases'    as keyof WeekRow, oursKey: 'ourPurchases'    as keyof WeekRow, isCcy: false },
    { key: 'rev',  label: 'Revenue',     color: '#22c55e', shareKey: 'revenueShare'    as keyof WeekRow, mktKey: 'mktRevenue'      as keyof WeekRow, oursKey: 'ourRevenue'      as keyof WeekRow, isCcy: true  },
  ];

  const adTypeLabels: Record<AdType, string> = { both: 'SP + SB', sp: 'SP Only', sb: 'SB Only' };

  const pctDeltaCell = (val: number, prevVal: number | undefined, invertColor: boolean, borderLeft?: string) => {
    if (prevVal == null) return (
      <td style={{ padding: '8px 10px', textAlign: 'center', verticalAlign: 'top', borderLeft: borderLeft || undefined, borderBottom: RB }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{val.toFixed(2)}%</div>
      </td>
    );
    const pp = val - prevVal;
    const pct = prevVal !== 0 ? ((val - prevVal) / Math.abs(prevVal)) * 100 : 0;
    const pos = pp >= 0;
    const getColor = (p: boolean) => invertColor ? (p ? '#f87171' : '#4ade80') : (p ? '#4ade80' : '#f87171');
    return (
      <td style={{ padding: '8px 10px', textAlign: 'center', verticalAlign: 'top', borderLeft: borderLeft || undefined, borderBottom: RB }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{val.toFixed(2)}%</div>
        <div style={{ fontSize: 10, fontWeight: 700, color: getColor(pos) }}>{pos ? '↑ +' : '↓ '}{Math.abs(pp).toFixed(2)}pp</div>
        <div style={{ fontSize: 10, fontWeight: 600, color: getColor(pos) }}>({pct >= 0 ? '+' : ''}{pct.toFixed(1)}%)</div>
      </td>
    );
  };

  const shareCell = (share: number, prevShare: number | undefined, borderLeft: string) => {
    if (prevShare == null) return (
      <td style={{ padding: '8px 10px', textAlign: 'center', verticalAlign: 'top', borderLeft, borderBottom: RB }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{share.toFixed(1)}%</div>
      </td>
    );
    const pp = share - prevShare;
    const pct = prevShare !== 0 ? ((share - prevShare) / Math.abs(prevShare)) * 100 : 0;
    const pos = pp >= 0;
    const col = pos ? '#4ade80' : '#f87171';
    return (
      <td style={{ padding: '8px 10px', textAlign: 'center', verticalAlign: 'top', borderLeft, borderBottom: RB }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{share.toFixed(1)}%</div>
        <div style={{ fontSize: 10, fontWeight: 700, color: col }}>{pos ? '↑ +' : '↓ '}{Math.abs(pp).toFixed(2)}pp</div>
        <div style={{ fontSize: 10, fontWeight: 600, color: col }}>({pct >= 0 ? '+' : ''}{pct.toFixed(1)}%)</div>
      </td>
    );
  };

  const valCell = (val: string, wowVal: { val: string; pos: boolean } | null, color: string, borderLeft?: string) => (
    <td style={{ padding: '8px 10px', textAlign: 'center', verticalAlign: 'top', borderLeft: borderLeft || undefined, borderBottom: RB }}>
      <div style={{ fontSize: 12, fontWeight: 700, color }}>{val}</div>
      {wowVal && <div style={{ fontSize: 10, fontWeight: 600, color: wowVal.pos ? '#4ade80' : '#f87171' }}>{wowVal.pos ? '↑ +' : '↓ '}{wowVal.val}</div>}
    </td>
  );

  return (
    <div className="fixed inset-0 z-50" style={{ pointerEvents: 'none' }}>
      <div className="absolute inset-0 bg-black/70" style={{ pointerEvents: 'auto' }} />
      <div ref={modalRef} className="absolute bg-zinc-900 border border-zinc-600 rounded-xl shadow-2xl flex flex-col"
        style={{ width: dims.w, height: dims.h, left: dims.l, top: dims.t, pointerEvents: 'auto', minWidth: minW.current, minHeight: 360, overflow: 'hidden' }}>
        {[['n',0,'top-0 left-[6px] right-[6px] h-[6px] cursor-n-resize'],['s',0,'bottom-0 left-[6px] right-[6px] h-[6px] cursor-s-resize'],['w',0,'left-0 top-[6px] bottom-[6px] w-[6px] cursor-w-resize'],['e',0,'right-0 top-[6px] bottom-[6px] w-[6px] cursor-e-resize'],['nw',0,'top-0 left-0 w-[6px] h-[6px] cursor-nw-resize'],['ne',0,'top-0 right-0 w-[6px] h-[6px] cursor-ne-resize'],['sw',0,'bottom-0 left-0 w-[6px] h-[6px] cursor-sw-resize'],['se',0,'bottom-0 right-0 w-[6px] h-[6px] cursor-se-resize']].map(([dir]) => (
          <div key={dir as string} style={edge({ ...(dir==='n'?{top:0,left:E,right:E,height:E,cursor:'n-resize'}:dir==='s'?{bottom:0,left:E,right:E,height:E,cursor:'s-resize'}:dir==='w'?{left:0,top:E,bottom:E,width:E,cursor:'w-resize'}:dir==='e'?{right:0,top:E,bottom:E,width:E,cursor:'e-resize'}:dir==='nw'?{top:0,left:0,width:E,height:E,cursor:'nw-resize'}:dir==='ne'?{top:0,right:0,width:E,height:E,cursor:'ne-resize'}:dir==='sw'?{bottom:0,left:0,width:E,height:E,cursor:'sw-resize'}:{bottom:0,right:0,width:E,height:E,cursor:'se-resize'}) })}
            onMouseDown={ev => startAction(ev, dir as string)} />
        ))}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-700 shrink-0"
          style={{ cursor: 'move', userSelect: 'none', borderBottom: HB }} onMouseDown={e => startAction(e, 'drag')}>
          <p className="text-white font-bold text-base">Full Funnel — Data</p>
          <button onClick={onClose} onMouseDown={e => e.stopPropagation()}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors">✕</button>
        </div>
        <div className="flex items-end gap-5 px-6 py-3 shrink-0 flex-wrap" style={{ background: '#1c1c1e', borderBottom: '1px solid rgba(255,255,255,0.10)' }}>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wide">Ad Type</span>
            <div className="flex bg-zinc-800 rounded-lg p-1 gap-1">
              {(['both','sp','sb'] as AdType[]).map(t => (
                <button key={t} onClick={() => setModalAdType(t)}
                  className={`px-3 py-1 rounded text-xs font-bold transition-colors ${modalAdType === t ? 'bg-orange-500 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}>
                  {adTypeLabels[t]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wide">Ads View</span>
            <div className="flex bg-zinc-800 rounded-lg p-1 gap-1">
              {(['search_term','keyword'] as ViewMode[]).map(v => (
                <button key={v} onClick={() => setModalViewMode(v)}
                  className={`px-3 py-1 rounded text-xs font-bold transition-colors ${modalViewMode === v ? 'bg-indigo-500 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}>
                  {v === 'search_term' ? 'By Search Term' : 'By Keyword'}
                </button>
              ))}
            </div>
          </div>
          {isMonthly ? (
            <><MonthDropdown label="Start Month" value={modalStart as MonthOption} onChange={m => setModalStart(m)} /><MonthDropdown label="End Month" value={modalEnd as MonthOption} onChange={m => setModalEnd(m)} maxMonth={modalStart as MonthOption} /></>
          ) : (
            <><WeekDropdown label="Start Week" value={modalStart as WeekOption} onChange={w => { setModalStart(w); if (w.start > (modalEnd as WeekOption).start) setModalEnd(w); }} /><WeekDropdown label="End Week" value={modalEnd as WeekOption} onChange={w => setModalEnd(w)} maxWeek={modalStart as WeekOption} /></>
          )}
          <div className="text-xs text-zinc-500 self-end pb-1">{rows.length} {isMonthly ? 'month' : 'week'}{rows.length !== 1 ? 's' : ''}</div>
          {(loadingSqp || loadingAds) && <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin self-end mb-1" />}
        </div>
        <div style={{ overflow: 'auto', flex: 1 }}>
          <div style={{ minWidth: 'max-content' }}>
            {loadingSqp ? (
              <div className="flex items-center justify-center py-20 gap-3"><div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /><p className="text-zinc-400 text-sm">Loading...</p></div>
            ) : (
              <table style={{ borderCollapse: 'collapse', fontSize: 11 }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 2, background: '#18181b' }}>
                  <tr>
                    <th rowSpan={2} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: YELLOW, borderBottom: HB, background: '#18181b', whiteSpace: 'nowrap' }}>
                      {isMonthly ? 'Month' : 'Week'}
                    </th>
                    <th rowSpan={2} style={{ padding: '10px 10px', textAlign: 'center', fontWeight: 700, color: YELLOW, borderBottom: HB, borderLeft: WB, background: '#1e1e22', whiteSpace: 'nowrap' }}>
                      Search Vol
                    </th>
                    <th colSpan={4} style={{ padding: '7px 10px 4px', textAlign: 'center', fontWeight: 700, color: '#818cf8', letterSpacing: '0.06em', textTransform: 'uppercase', borderBottom: HB, borderLeft: WB, background: '#1c1c2e', whiteSpace: 'nowrap' }}>
                      Ads KPIs <span style={{ fontSize: 9, opacity: 0.7 }}>({adTypeLabels[modalAdType]})</span>
                    </th>
                    {SQP_KPIS.map(g => (
                      <th key={g.key} colSpan={expandedKpis.has(g.key) ? 3 : 1}
                        style={{ padding: '6px 10px 3px', textAlign: 'center', fontWeight: 700, borderBottom: HB, borderLeft: WB, background: '#1e1e22', whiteSpace: 'nowrap' }}>
                        <div style={{ color: g.color, fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{g.label}</div>
                        <button onClick={() => toggleKpi(g.key)}
                          style={{ marginTop: 3, fontSize: 10, fontWeight: 700, color: '#fff', background: '#3f3f46', border: 'none', borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}>
                          {expandedKpis.has(g.key) ? '− collapse' : '+ expand'}
                        </button>
                      </th>
                    ))}
                  </tr>
                  <tr style={{ background: '#1a1a1e', borderBottom: HB }}>
                    <th style={{ padding: '5px 8px', textAlign: 'center', fontWeight: 700, color: YELLOW, borderLeft: WB, whiteSpace: 'nowrap' }}>Ad Spend</th>
                    <th style={{ padding: '5px 8px', textAlign: 'center', fontWeight: 700, color: YELLOW, whiteSpace: 'nowrap' }}>Ad Sales</th>
                    <th style={{ padding: '5px 8px', textAlign: 'center', fontWeight: 700, color: YELLOW, whiteSpace: 'nowrap' }}>ACoS%</th>
                    <th style={{ padding: '5px 8px', textAlign: 'center', fontWeight: 700, color: YELLOW, whiteSpace: 'nowrap' }}>CPC</th>
                    {SQP_KPIS.map(g => (
                      <>
                        <th key={`${g.key}-share`} style={{ padding: '5px 10px', textAlign: 'center', fontWeight: 700, color: YELLOW, borderLeft: WB, whiteSpace: 'nowrap' }}>Share</th>
                        {expandedKpis.has(g.key) && <>
                          <th key={`${g.key}-mkt`}  style={{ padding: '5px 8px', textAlign: 'center', fontWeight: 700, color: YELLOW, whiteSpace: 'nowrap' }}>Market</th>
                          <th key={`${g.key}-ours`} style={{ padding: '5px 8px', textAlign: 'center', fontWeight: 700, color: YELLOW, whiteSpace: 'nowrap' }}>Ours</th>
                        </>}
                      </>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx, arr) => {
                    const prevRow = arr[idx + 1] ?? null;
                    const ads     = adsDataMap.get(row.weekKey) ?? null;
                    const prevAds = prevRow ? (adsDataMap.get(prevRow.weekKey) ?? null) : null;
                    const label   = isMonthly ? `${row.weekNumber}/${row.year}` : `W${row.weekNumber}/${row.year}`;
                    const dc2 = (a: number, b: number|undefined) => { if (!b) return null; const p2 = ((a-b)/Math.abs(b))*100; return { val: `${p2>=0?'+':''}${p2.toFixed(1)}%`, pos: p2>=0 }; };
                    return (
                      <tr key={row.weekKey}
                        onMouseEnter={e => (e.currentTarget.style.background = '#27272a')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <td style={{ padding: '8px 14px', verticalAlign: 'top', borderBottom: RB }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{label}</div>
                          <div style={{ fontSize: 10, color: '#71717a', marginTop: 1 }}>{row.weekKey}</div>
                        </td>
                        {valCell(fmtK(row.searchVolume), prevRow ? dc2(row.searchVolume, prevRow.searchVolume) : null, '#e4e4e7', WB)}
                        {ads ? <>
                          {valCell(fmtCcy(ads.spend), prevAds ? dc2(ads.spend, prevAds.spend) : null, '#facc15', WB)}
                          {valCell(fmtCcy(ads.sales), prevAds ? dc2(ads.sales, prevAds.sales) : null, '#fff')}
                          {pctDeltaCell(ads.acos, prevAds?.acos, true)}
                          {valCell(fmtCcyExact(ads.cpc), prevAds ? dc2(ads.cpc, prevAds.cpc) : null, '#facc15')}
                        </> : <td colSpan={4} style={{ textAlign: 'center', color: '#52525b', fontSize: 11, borderLeft: WB, borderBottom: RB }}>—</td>}
                        {SQP_KPIS.map(g => {
                          const share     = row[g.shareKey]  as number;
                          const prevShare = prevRow ? prevRow[g.shareKey] as number : undefined;
                          const mktVal    = row[g.mktKey]    as number;
                          const oursVal   = row[g.oursKey]   as number;
                          const prevMkt   = prevRow ? prevRow[g.mktKey]   as number : undefined;
                          const prevOurs  = prevRow ? prevRow[g.oursKey]  as number : undefined;
                          const fmtVal    = g.isCcy ? fmtCcy : fmtK;
                          return (
                            <>
                              {shareCell(share, prevShare, WB)}
                              {expandedKpis.has(g.key) && <>
                                {valCell(fmtVal(mktVal),  prevMkt  ? dc2(mktVal,  prevMkt)  : null, '#e4e4e7')}
                                {valCell(fmtVal(oursVal), prevOurs ? dc2(oursVal, prevOurs) : null, '#facc15')}
                              </>}
                            </>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function KeywordDeepDivePage() {
  const [mode, setMode] = useState<'weekly' | 'monthly'>('weekly');
  const [brandOpts,  setBrandOpts]  = useState<Opt[]>([]);
  const [familyOpts, setFamilyOpts] = useState<Opt[]>([]);
  const [asinOpts,   setAsinOpts]   = useState<AsinOpt[]>([]);
  const [kwOpts,     setKwOpts]     = useState<string[]>([]);
  const [selBrand,    setSelBrand]    = useState('');
  const [selFamilies, setSelFamilies] = useState<string[]>([]);
  const [selAsins,    setSelAsins]    = useState<string[]>([]);
  const [selKeyword,  setSelKeyword]  = useState<string | null>(null);
  const [data,      setData]      = useState<WeekRow[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [status,    setStatus]    = useState<'idle'|'no-keywords'|'no-data'|'loaded'>('idle');
  const [showModal, setShowModal] = useState(false);
  const [adsViewMode, setAdsViewMode] = useState<ViewMode>('search_term');
  const [mergeSB,     setMergeSB]     = useState(false);
  const [sbExpanded,  setSbExpanded]  = useState(false);
  const autoSelectDone = useRef(false);
  // ── ref to track the latest fetch so stale responses are discarded ──────────
  const fetchIdRef = useRef(0);

  const autoSelectTopFamily = useCallback(async (brand: string) => {
    try {
      const res = await fetch(`/api/dashboard/filters?type=top-family&brand=${encodeURIComponent(brand)}`);
      const d = await res.json();
      if (d.family) setSelFamilies([d.family]);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetch('/api/dashboard/filters?type=brands').then(r => r.json()).then(d => {
      const opts = (d.brands ?? []).map((b: string) => ({ value: b, label: b }));
      setBrandOpts(opts);
      if (opts.length > 0 && !autoSelectDone.current) {
        autoSelectDone.current = true;
        const first = opts[0].value;
        setSelBrand(first);
        autoSelectTopFamily(first);
      }
    });
  }, [autoSelectTopFamily]);

  useEffect(() => {
    if (!selBrand) return;
    fetch(`/api/dashboard/filters?type=families&brands=${selBrand}`).then(r => r.json()).then(d => {
      const opts = (d.families ?? []).map((f: { family_name: string }) => ({ value: f.family_name, label: f.family_name }));
      setFamilyOpts(opts);
      setSelFamilies(prev => prev.filter(f => opts.some((o: Opt) => o.value === f)));
    });
  }, [selBrand]);

  useEffect(() => {
    const fq = selFamilies.length > 0 ? `&families=${selFamilies.join(',')}` : '';
    const bq = selBrand ? `&brands=${selBrand}` : '';
    if (!fq && !bq) { setAsinOpts([]); return; }
    fetch(`/api/dashboard/filters?type=asins${fq}${bq}`).then(r => r.json()).then(d => {
      const opts: AsinOpt[] = (d.asins ?? []).map((a: { child_asin: string; product_name?: string; family_name: string }) => ({ value: a.child_asin, label: a.product_name ? `${a.child_asin} — ${a.product_name}` : a.child_asin, family: a.family_name }));
      setAsinOpts(opts);
      setSelAsins(prev => prev.filter(a => opts.some((o: AsinOpt) => o.value === a)));
    });
  }, [selFamilies, selBrand]);

  const effectiveFamiliesStr = useMemo(() => {
    let fams: string[];
    if (selFamilies.length > 0)   fams = selFamilies;
    else if (selAsins.length > 0) fams = [...new Set(asinOpts.filter(o => selAsins.includes(o.value)).map(o => o.family))];
    else                           fams = familyOpts.map(f => f.value);
    return fams.sort().join(',');
  }, [selFamilies, selAsins, asinOpts, familyOpts]);

  useEffect(() => {
    if (!effectiveFamiliesStr) { setKwOpts([]); setSelKeyword(null); return; }
    fetch(`/api/dashboard/filters?type=keywords&families=${effectiveFamiliesStr}`).then(r => r.json()).then(d => setKwOpts(d.keywords ?? []));
  }, [effectiveFamiliesStr]);

  const handleBrandChange = useCallback((brand: string) => {
    setSelBrand(brand); setSelFamilies([]); setSelAsins([]); setSelKeyword(null);
    autoSelectTopFamily(brand);
  }, [autoSelectTopFamily]);

  // ── fetchData with AbortController to prevent race conditions ───────────────
  const fetchData = useCallback(async () => {
    if (!selBrand && selFamilies.length === 0 && selAsins.length === 0) return;

    // Tag this fetch with an incrementing ID
    const myFetchId = ++fetchIdRef.current;
    const controller = new AbortController();

    setLoading(true);
    try {
      const startDate = mode === 'monthly' ? DEFAULT_START_MONTH.start : DEFAULT_START_WEEK.start;
      const endDate   = mode === 'monthly' ? DEFAULT_END_MONTH.end     : DEFAULT_END_WEEK.end;
      const res = await fetch('/api/dashboard/funnel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brands: selBrand ? [selBrand] : [],
          families: selFamilies, asins: selAsins,
          startDate, endDate, keyword: selKeyword, mode,
        }),
        signal: controller.signal,
      });
      const d = await res.json();

      // Discard result if a newer fetch has started since this one was initiated
      if (myFetchId !== fetchIdRef.current) return;

      if (d.noKeywords)         { setStatus('no-keywords'); setData([]); }
      else if (!d.data?.length) { setStatus('no-data');     setData([]); }
      else                      { setData(d.data);          setStatus('loaded'); }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      if (myFetchId === fetchIdRef.current) setStatus('no-data');
    } finally {
      if (myFetchId === fetchIdRef.current) setLoading(false);
    }

    return () => controller.abort();
  }, [selBrand, selFamilies, selAsins, selKeyword, mode]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const curr = data.length > 0 ? data[data.length - 1] : null;
  const prev = data.length > 1 ? data[data.length - 2] : null;

  const sqpPills = curr ? [
    { title: 'Impressions', color: '#3b82f6', ring: { share: curr.impressionShare, count: fmtK(curr.ourImpressions), pct: `${curr.impressionShare.toFixed(1)}%` },
      stats: [{ label: 'Market', value: fmtK(curr.mktImpressions), change: prev ? wowPct(curr.mktImpressions, prev.mktImpressions) : null }, { label: 'Ours', value: fmtK(curr.ourImpressions), change: prev ? wowPct(curr.ourImpressions, prev.ourImpressions) : null }, { label: 'Imp. Share', value: `${curr.impressionShare.toFixed(1)}%`, change: prev ? wowPP(curr.impressionShare, prev.impressionShare) : null }] },
    { title: 'Clicks',      color: '#06b6d4', ring: { share: curr.clickShare, count: fmtK(curr.ourClicks), pct: `${curr.clickShare.toFixed(1)}%` },
      stats: [{ label: 'Market', value: fmtK(curr.mktClicks), change: prev ? wowPct(curr.mktClicks, prev.mktClicks) : null }, { label: 'Ours', value: fmtK(curr.ourClicks), change: prev ? wowPct(curr.ourClicks, prev.ourClicks) : null }, { label: 'Click Share', value: `${curr.clickShare.toFixed(1)}%`, change: prev ? wowPP(curr.clickShare, prev.clickShare) : null }, { label: 'Mkt CTR%', value: `${curr.mktCTR.toFixed(2)}%`, change: prev ? wowPP(curr.mktCTR, prev.mktCTR) : null }, { label: 'Our CTR%', value: `${curr.ourCTR.toFixed(2)}%`, change: prev ? wowPP(curr.ourCTR, prev.ourCTR) : null }] },
    { title: 'Cart Adds',   color: '#f97316', ring: { share: curr.cartAddShare, count: fmtK(curr.ourCartAdds), pct: `${curr.cartAddShare.toFixed(1)}%` },
      stats: [{ label: 'Market', value: fmtK(curr.mktCartAdds), change: prev ? wowPct(curr.mktCartAdds, prev.mktCartAdds) : null }, { label: 'Ours', value: fmtK(curr.ourCartAdds), change: prev ? wowPct(curr.ourCartAdds, prev.ourCartAdds) : null }, { label: 'Cart Share', value: `${curr.cartAddShare.toFixed(1)}%`, change: prev ? wowPP(curr.cartAddShare, prev.cartAddShare) : null }, { label: 'Mkt ATC%', value: `${curr.mktATC.toFixed(2)}%`, change: prev ? wowPP(curr.mktATC, prev.mktATC) : null }, { label: 'Our ATC%', value: `${curr.ourATC.toFixed(2)}%`, change: prev ? wowPP(curr.ourATC, prev.ourATC) : null }] },
    { title: 'Purchases',   color: '#a855f7', ring: { share: curr.purchaseShare, count: fmtK(curr.ourPurchases), pct: `${curr.purchaseShare.toFixed(1)}%` },
      stats: [{ label: 'Market', value: fmtK(curr.mktPurchases), change: prev ? wowPct(curr.mktPurchases, prev.mktPurchases) : null }, { label: 'Ours', value: fmtK(curr.ourPurchases), change: prev ? wowPct(curr.ourPurchases, prev.ourPurchases) : null }, { label: 'Purch. Share', value: `${curr.purchaseShare.toFixed(1)}%`, change: prev ? wowPP(curr.purchaseShare, prev.purchaseShare) : null }, { label: 'Mkt CVR%', value: `${curr.mktCVR.toFixed(2)}%`, change: prev ? wowPP(curr.mktCVR, prev.mktCVR) : null }, { label: 'Our CVR%', value: `${curr.ourCVR.toFixed(2)}%`, change: prev ? wowPP(curr.ourCVR, prev.ourCVR) : null }] },
    { title: 'Revenue',     color: '#22c55e', ring: { share: curr.revenueShare, count: fmtCcy(curr.ourRevenue), pct: `${curr.revenueShare.toFixed(1)}%` },
      stats: [{ label: 'Market Rev.', value: fmtCcy(curr.mktRevenue), change: prev ? wowPct(curr.mktRevenue, prev.mktRevenue) : null }, { label: 'Our Rev.', value: fmtCcy(curr.ourRevenue), change: prev ? wowPct(curr.ourRevenue, prev.ourRevenue) : null }, { label: 'Rev. Share', value: `${curr.revenueShare.toFixed(1)}%`, change: prev ? wowPP(curr.revenueShare, prev.revenueShare) : null }] },
  ] : [];

  return (
    <div className="min-h-screen bg-zinc-900 text-white">
      <div className="border-b border-zinc-800 px-8 py-5">
        <h1 className="text-xl font-bold text-white">Keyword Deep Dive</h1>
        <p className="text-sm text-zinc-300 mt-1">Full funnel KPIs filtered to your tracked keywords</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-zinc-700 px-8">
        <div className="flex">
          {([['weekly', 'Week over Week'], ['monthly', 'Month over Month']] as const).map(([val, label]) => (
            <button key={val} onClick={() => setMode(val)}
              className={`py-4 px-6 text-sm font-semibold border-b-2 transition-colors ${mode === val ? 'border-orange-400 text-orange-400' : 'border-transparent text-zinc-300 hover:text-white'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-8 py-6 space-y-6">
        {/* Filter bar */}
        <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4">
          <div className="flex flex-wrap items-end gap-4">
            <BrandSelect opts={brandOpts} value={selBrand} onChange={handleBrandChange} />
            <MultiSel opts={familyOpts} value={selFamilies} label="Family" onChange={v => { setSelFamilies(v); setSelAsins([]); setSelKeyword(null); }} placeholder="Family" disabled={!selBrand} />
            <MultiSel opts={asinOpts} value={selAsins} label="Child ASIN" onChange={v => { setSelAsins(v); setSelKeyword(null); }} placeholder="Child ASIN" disabled={selFamilies.length === 0} />
            <KeywordSel opts={kwOpts} value={selKeyword} onChange={setSelKeyword} disabled={kwOpts.length === 0} />
            {curr && (
              <div className="flex items-center gap-2 px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg self-end">
                <span className="text-xs text-zinc-400">Latest</span>
                <span className="text-xs font-bold text-white">{mode === 'monthly' ? `${curr.weekNumber}/${curr.year}` : `W${curr.weekNumber}/${curr.year}`}</span>
              </div>
            )}
          </div>
        </div>

        {/* ADS KPIs */}
        <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-bold text-white tracking-widest uppercase">Ads KPIs</p>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-1 bg-zinc-700 rounded-lg p-1">
                {(['search_term','keyword'] as const).map(v => (
                  <button key={v} onClick={() => setAdsViewMode(v)}
                    className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${adsViewMode === v ? 'bg-zinc-500 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}>
                    {v === 'search_term' ? 'By Search Term' : 'By Keyword'}
                  </button>
                ))}
              </div>
              <Toggle value={mergeSB} onChange={v => { setMergeSB(v); if (v) setSbExpanded(false); }} label="Merge SB" />
            </div>
          </div>
          <AdsKpiSection brands={selBrand ? [selBrand] : []} families={selFamilies} viewMode={adsViewMode} filterValue={selKeyword} mode={mode} sectionLabel={mergeSB ? 'SP + SB Combined' : 'SP'} adTypes={mergeSB ? ['SP','SB'] : ['SP']} />
          {!mergeSB && (
            <div className="border-t border-zinc-700 pt-4">
              <button onClick={() => setSbExpanded(v => !v)} className="flex items-center gap-2 text-xs font-bold text-zinc-300 hover:text-white transition-colors">
                <svg className={`w-4 h-4 transition-transform ${sbExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                {sbExpanded ? '− Collapse SB KPIs' : '+ Expand SB KPIs'}
              </button>
              {sbExpanded && <div className="mt-4"><AdsKpiSection brands={selBrand ? [selBrand] : []} families={selFamilies} viewMode={adsViewMode} filterValue={selKeyword} mode={mode} sectionLabel="SB" adTypes={['SB']} /></div>}
            </div>
          )}
        </div>

        {/* SQP KPIs */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-zinc-300 tracking-widest uppercase">SQP KPIs</p>
            {status === 'loaded' && data.length > 0 && (
              <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white text-sm font-semibold rounded-lg transition-colors">Show Data</button>
            )}
          </div>
          {loading && (<div className="flex items-center gap-3 py-20 justify-center"><div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /><p className="text-sm text-zinc-300">Loading funnel data...</p></div>)}
          {!loading && status === 'no-keywords' && (<div className="py-20 text-center"><p className="text-zinc-300 text-sm">No tracked keywords found for this selection.</p><p className="text-zinc-500 text-xs mt-1">Add keywords in the Keyword Tracker table under Data Upload.</p></div>)}
          {!loading && status === 'no-data' && (<div className="py-20 text-center"><p className="text-zinc-300 text-sm">No SQP data found for this selection.</p></div>)}
          {!loading && status === 'loaded' && curr && (
            <div className="flex gap-4 items-stretch">
              {sqpPills.map(p => <SqpPill key={p.title} {...p} />)}
            </div>
          )}
        </div>
      </div>

      {showModal && <DataModal brand={selBrand} families={selFamilies} asins={selAsins} keyword={selKeyword} onClose={() => setShowModal(false)} mode={mode} />}
    </div>
  );
}