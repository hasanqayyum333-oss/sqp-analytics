'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { useFilters, generateWeeks, generateMonths } from '../filter-context';

const ALL_WEEKS  = generateWeeks();
const ALL_MONTHS = generateMonths();
type WeekOption  = typeof ALL_WEEKS[number];
type MonthOption = typeof ALL_MONTHS[number];
type FilterOption = { value: string; label: string };
type KwMode = 'non-branded' | 'both' | 'branded';

type TrendRow = {
  dateKey: string; endDate: string; periodNumber: number; year: number;
  searchVolume: number;
  ourImpressions: number; marketImpressions: number; impressionShare: number;
  ourClicks: number; marketClicks: number; clickShare: number;
  ourCartAdds: number; marketCartAdds: number; cartAddShare: number;
  ourPurchases: number; marketPurchases: number; purchaseShare: number;
  ourClickPrice: number | null; marketClickPrice: number | null;
  ourCartPrice: number | null; marketCartPrice: number | null;
  ourPurchasePrice: number | null; marketPurchasePrice: number | null;
};

type BrandedTermRow = {
  weekKey: string; weekEnd: string; weekNumber: number; year: number;
  searchTerm: string; searchVolume: number;
  mktImpressions: number; ourImpressions: number;
  mktClicks: number; ourClicks: number;
  mktCartAdds: number; ourCartAdds: number;
  mktPurchases: number; ourPurchases: number;
  mktRevenue: number; ourRevenue: number;
};

type PriceBracket = { label: string; min: number; max: number; ctrImpact: number; atcImpact: number; cvrImpact: number };
const DEFAULT_BRACKETS: PriceBracket[] = [
  { label: '0-15%',  min: 0,  max: 15,      ctrImpact: 3.5,  atcImpact: 2.0,  cvrImpact: 2.0  },
  { label: '15-30%', min: 15, max: 30,       ctrImpact: 8.5,  atcImpact: 5.0,  cvrImpact: 5.0  },
  { label: '30-50%', min: 30, max: 50,       ctrImpact: 17.0, atcImpact: 10.0, cvrImpact: 10.0 },
  { label: '50-80%', min: 50, max: 80,       ctrImpact: 28.5, atcImpact: 16.0, cvrImpact: 16.0 },
  { label: '80%+',   min: 80, max: Infinity, ctrImpact: 35.0, atcImpact: 22.0, cvrImpact: 22.0 },
];
function getPremiumImpact(premium: number, brackets: PriceBracket[], kpi: 'ctr' | 'atc' | 'cvr') {
  if (premium <= 0) return 0;
  const b = brackets.find(b => premium >= b.min && premium < b.max) ?? brackets[brackets.length - 1];
  return kpi === 'ctr' ? b.ctrImpact : kpi === 'atc' ? b.atcImpact : b.cvrImpact;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function fmtK(n: number) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
  if (n >= 1000)    return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}
function fmtRev(n: number) {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000)    return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}
function fmtPrice(n: number | null) { return n != null && n > 0 ? `$${n.toFixed(2)}` : '—'; }
function fmtDate(d: string) {
  return new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' });
}
function dc(v: number) { return v >= 0 ? '#4ade80' : '#f87171'; }
function ds(v: number) { return v >= 0 ? '↑ +' : '↓ '; }
function wowPct(curr: number, prev: number) {
  if (!prev) return null;
  const p = ((curr - prev) / Math.abs(prev)) * 100;
  return { val: `${p >= 0 ? '+' : ''}${p.toFixed(1)}%`, pos: p >= 0 };
}

// ─── KW MODE BADGE STYLES ─────────────────────────────────────────────────────
const KW_BADGE: Record<KwMode, { label: string; bg: string; color: string }> = {
  'non-branded': { label: 'Non-Branded Only',        bg: '#1e3a5f', color: '#60a5fa' },
  'both':        { label: 'Branded + Non-Branded',   bg: '#3f3f46', color: '#d4d4d8' },
  'branded':     { label: 'Branded Only',            bg: '#14532d', color: '#4ade80' },
};

// ─── DONUT SHARE PILL ─────────────────────────────────────────────────────────
const DONUT_TRACK: Record<string, string> = {
  '#6366f1': '#3730a3', '#06b6d4': '#164e63', '#f97316': '#7c2d12',
  '#a855f7': '#581c87', '#4ade80': '#14532d',
};

interface DonutPillProps {
  label: string; color: string; share: number;
  mktValue: string; mktWow: number | null;
  oursValue: string; oursWow: number | null;
  sharePP: number | null; sharePct: number | null;
  periodLabel: string;
}
function ShareDonutPill({ label, color, share, mktValue, mktWow, oursValue, oursWow, sharePP, sharePct, periodLabel }: DonutPillProps) {
  const r = 40; const circ = 2 * Math.PI * r;
  const arcLen = Math.min((share / 100) * circ, circ - 0.5);
  const dashArray = `${arcLen.toFixed(2)} ${(circ - arcLen).toFixed(2)}`;
  const zero = sharePP !== null && Math.abs(sharePP) < 0.001;
  const pos  = sharePP !== null && sharePP > 0;
  const dColor = zero ? '#71717a' : pos ? '#4ade80' : '#f87171';
  const trackColor = DONUT_TRACK[color] ?? '#3f3f46';
  const sz = 100; const cx = sz / 2;
  return (
    <div className="bg-zinc-700/50 border border-zinc-600 rounded-lg p-4 flex items-center gap-4">
      <div className="relative flex-shrink-0" style={{ width: sz, height: sz }}>
        <svg width={sz} height={sz} viewBox={`0 0 ${sz} ${sz}`}>
          <circle cx={cx} cy={cx} r={r} fill="none" stroke={trackColor} strokeWidth="11" />
          <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth="11"
            strokeDasharray={dashArray} strokeDashoffset="0" transform={`rotate(-90 ${cx} ${cx})`} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span style={{ fontSize: 18, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>{share.toFixed(1)}%</span>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p style={{ fontSize: 11, fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>{label}</p>
        <div className="flex justify-between items-start mb-2">
          <span style={{ fontSize: 12, fontWeight: 700, color: '#d1d5db' }}>Market</span>
          <div className="text-right">
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{mktValue}</div>
            {mktWow !== null && <div style={{ fontSize: 11, fontWeight: 600, color: dc(mktWow) }}>{ds(mktWow)}{Math.abs(mktWow).toFixed(1)}%</div>}
          </div>
        </div>
        <div className="flex justify-between items-start mb-2">
          <span style={{ fontSize: 12, fontWeight: 700, color: '#d1d5db' }}>Ours</span>
          <div className="text-right">
            <div style={{ fontSize: 13, fontWeight: 800, color: '#facc15' }}>{oursValue}</div>
            {oursWow !== null && <div style={{ fontSize: 11, fontWeight: 600, color: dc(oursWow) }}>{ds(oursWow)}{Math.abs(oursWow).toFixed(1)}%</div>}
          </div>
        </div>
        <div className="flex justify-between items-start" style={{ borderTop: '1px solid #3f3f46', paddingTop: 7 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#d1d5db' }}>Share</span>
          <div className="text-right">
            <div style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>{share.toFixed(1)}%</div>
            {sharePP !== null && !zero && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: dColor }}>{ds(sharePP)}{Math.abs(sharePP).toFixed(2)}pp</div>
                {sharePct !== null && <div style={{ fontSize: 11, fontWeight: 600, color: dColor }}>({sharePct >= 0 ? '+' : ''}{sharePct.toFixed(1)}%)</div>}
              </>
            )}
          </div>
        </div>
        <p style={{ fontSize: 11, fontWeight: 600, color: '#71717a', marginTop: 4 }}>{periodLabel}</p>
      </div>
    </div>
  );
}

// ─── CHART TOOLTIP ────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label, coordinate, viewBox }: {
  active?: boolean; payload?: { name: string; value: number; color: string }[];
  label?: string; coordinate?: { x: number }; viewBox?: { width: number };
}) {
  if (!active || !payload?.length) return null;
  const nearRight = coordinate && viewBox && coordinate.x > viewBox.width * 0.5;
  return (
    <div className="bg-zinc-800 border border-zinc-600 rounded-lg p-3 shadow-xl text-sm"
      style={{ transform: nearRight ? 'translateX(calc(-100% - 16px))' : 'translateX(16px)' }}>
      <p className="text-zinc-200 font-bold mb-2">{label}</p>
      {payload.map((p, i) => {
        const isVol   = p.name === 'Search Volume';
        const isPrice = p.name.toLowerCase().includes('price');
        const display = isVol ? fmtK(p.value) : isPrice ? `$${p.value.toFixed(2)}` : `${p.value.toFixed(2)}%`;
        return (
          <div key={i} className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
            <span className="text-zinc-300">{p.name}:</span>
            <span className="text-white font-semibold">{display}</span>
          </div>
        );
      })}
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
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch(''); } };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);
  const filtered = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));
  const label = options.find(o => o.value === selected)?.label ?? selected ?? 'Brand';
  return (
    <div ref={ref} className="relative min-w-[160px]">
      <label className="block text-xs font-bold text-white mb-1 uppercase tracking-wide">Brand</label>
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between bg-zinc-700 border border-zinc-600 text-white text-sm rounded px-3 py-2 hover:border-zinc-500 cursor-pointer">
        <span className="truncate" suppressHydrationWarning>{label}</span>
        <svg className={`w-4 h-4 text-zinc-300 flex-shrink-0 ml-2 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[240px] bg-zinc-700 border border-zinc-600 rounded shadow-xl">
          <div className="p-2 border-b border-zinc-600">
            <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-sm text-white placeholder-zinc-500 outline-none" autoFocus />
          </div>
          <div className="overflow-y-auto max-h-52">
            {filtered.length === 0 ? <p className="text-xs text-zinc-400 px-3 py-2">No results</p> :
              filtered.map(opt => (
                <div key={opt.value} onClick={() => { onChange(opt.value); setOpen(false); setSearch(''); }}
                  className={`px-3 py-2 text-sm cursor-pointer ${selected === opt.value ? 'text-orange-400 bg-orange-500/10' : 'text-zinc-200 hover:bg-zinc-600'}`}>
                  {opt.label}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MULTI SELECT ─────────────────────────────────────────────────────────────
function MultiSelect({ label, options, selected, onChange, disabled = false }: { label: string; options: FilterOption[]; selected: string[]; onChange: (v: string[]) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false); const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);
  const filtered = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));
  const allSelected = selected.length === options.length && options.length > 0;
  const toggle = (val: string) => onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);
  const displayText = selected.length === 0 ? `All ${label}` : selected.length === 1 ? (options.find(o => o.value === selected[0])?.label ?? selected[0]) : `${selected.length} ${label} selected`;
  return (
    <div ref={ref} className="relative min-w-[160px]">
      <label className="block text-xs font-bold text-white mb-1 uppercase tracking-wide">{label}</label>
      <button type="button" disabled={disabled} onClick={() => !disabled && setOpen(o => !o)}
        className={`w-full flex items-center justify-between bg-zinc-700 border border-zinc-600 text-sm rounded px-3 py-2 transition-colors ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:border-zinc-500 cursor-pointer'} ${selected.length > 0 ? 'text-white' : 'text-zinc-300'}`}>
        <span className="truncate">{displayText}</span>
        <svg className={`w-4 h-4 text-zinc-300 flex-shrink-0 ml-2 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[360px] bg-zinc-700 border border-zinc-600 rounded shadow-xl">
          <div className="p-2 border-b border-zinc-600">
            <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-sm text-white placeholder-zinc-500 outline-none" autoFocus />
          </div>
          <div className="px-2 py-1 border-b border-zinc-600 flex gap-2">
            <button onClick={() => onChange(allSelected ? [] : options.map(o => o.value))} className="text-xs text-orange-400 hover:text-orange-300">{allSelected ? 'Clear all' : 'Select all'}</button>
            {selected.length > 0 && <button onClick={() => onChange([])} className="text-xs text-zinc-400 hover:text-zinc-200">Clear</button>}
          </div>
          <div className="overflow-y-auto max-h-52">
            {filtered.length === 0 ? <p className="text-xs text-zinc-400 px-3 py-2">No results</p> :
              filtered.map(opt => (
                <div key={opt.value} onClick={() => toggle(opt.value)} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-zinc-600">
                  <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${selected.includes(opt.value) ? 'bg-orange-500 border-orange-500' : 'border-zinc-500'}`}>
                    {selected.includes(opt.value) && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                  </div>
                  <span className="text-sm text-zinc-200 truncate">{opt.label}</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── WEEK DROPDOWN ────────────────────────────────────────────────────────────
function WeekDropdown({ label, value, onChange, maxWeek }: { label: string; value: WeekOption; onChange: (w: WeekOption) => void; maxWeek?: WeekOption }) {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);
  const available = maxWeek ? ALL_WEEKS.filter(w => w.start >= maxWeek!.start) : ALL_WEEKS;
  return (
    <div ref={ref} className="relative min-w-[200px]">
      <label className="block text-xs font-bold text-white mb-1 uppercase tracking-wide">{label}</label>
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between bg-zinc-700 border border-zinc-600 text-white text-sm rounded px-3 py-2 hover:border-zinc-500">
        <span className="truncate">{value.label}</span>
        <svg className={`w-4 h-4 text-zinc-300 flex-shrink-0 ml-2 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-zinc-700 border border-zinc-600 rounded shadow-xl overflow-hidden">
          <div className="overflow-y-auto max-h-64">
            {available.map(w => <div key={w.start} onClick={() => { onChange(w); setOpen(false); }} className={`px-3 py-2 text-sm cursor-pointer ${w.start === value.start ? 'bg-orange-500 text-white' : 'text-zinc-200 hover:bg-zinc-600'}`}>{w.label}</div>)}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MONTH DROPDOWN ───────────────────────────────────────────────────────────
function MonthDropdown({ label, value, onChange, maxMonth }: { label: string; value: MonthOption; onChange: (m: MonthOption) => void; maxMonth?: MonthOption }) {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);
  const available = maxMonth ? ALL_MONTHS.filter(m => m.start >= maxMonth!.start) : ALL_MONTHS;
  return (
    <div ref={ref} className="relative min-w-[200px]">
      <label className="block text-xs font-bold text-white mb-1 uppercase tracking-wide">{label}</label>
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between bg-zinc-700 border border-zinc-600 text-white text-sm rounded px-3 py-2 hover:border-zinc-500">
        <span className="truncate">{value.label}</span>
        <svg className={`w-4 h-4 text-zinc-300 flex-shrink-0 ml-2 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-zinc-700 border border-zinc-600 rounded shadow-xl overflow-hidden">
          <div className="overflow-y-auto max-h-64">
            {available.map(m => <div key={m.start} onClick={() => { onChange(m); setOpen(false); }} className={`px-3 py-2 text-sm cursor-pointer ${m.start === value.start ? 'bg-orange-500 text-white' : 'text-zinc-200 hover:bg-zinc-600'}`}>{m.label}</div>)}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── DATA MODAL ───────────────────────────────────────────────────────────────
type ResizeState = { active: boolean; dir: string; startX: number; startY: number; startW: number; startH: number; startL: number; startT: number } | null;

function DataModal({ open, onClose, children, title }: { open: boolean; onClose: () => void; children: React.ReactNode; title: string }) {
  const [dims, setDims] = useState({ w: 0, h: 480, l: 0, t: 0, ready: false });
  const dimsRef     = useRef(dims);
  const resizingRef = useRef<ResizeState>(null);
  const modalRef    = useRef<HTMLDivElement>(null);
  const minW        = useRef(0);

  useEffect(() => { dimsRef.current = dims; }, [dims]);

  useEffect(() => {
    if (open && !dims.ready && typeof window !== 'undefined') {
      const w = Math.round(window.innerWidth * 0.50);
      minW.current = w;
      setDims({ w, h: 480, l: Math.round((window.innerWidth - w) / 2), t: Math.round((window.innerHeight - 480) / 2), ready: true });
    }
    if (!open) setDims(d => ({ ...d, ready: false }));
  }, [open]);

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

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h); return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  if (!open || !dims.ready) return null;

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

  const edge = (extra: React.CSSProperties): React.CSSProperties => ({ position: 'absolute', zIndex: 10, ...extra });
  const E = 6;

  return (
    <div className="fixed inset-0 z-50" style={{ pointerEvents: 'none' }}>
      <div className="absolute inset-0 bg-black/70" style={{ pointerEvents: 'auto' }} />
      <div ref={modalRef} className="absolute bg-zinc-800 border border-zinc-600 rounded-xl shadow-2xl flex flex-col"
        style={{ width: dims.w, height: dims.h, left: dims.l, top: dims.t, pointerEvents: 'auto', minWidth: minW.current, minHeight: 300, overflow: 'hidden' }}>
        <div style={edge({ top: 0, left: E, right: E, height: E, cursor: 'n-resize' })}  onMouseDown={e => startResize(e, 'n')} />
        <div style={edge({ bottom: 0, left: E, right: E, height: E, cursor: 's-resize' })} onMouseDown={e => startResize(e, 's')} />
        <div style={edge({ left: 0, top: E, bottom: E, width: E, cursor: 'w-resize' })}  onMouseDown={e => startResize(e, 'w')} />
        <div style={edge({ right: 0, top: E, bottom: E, width: E, cursor: 'e-resize' })} onMouseDown={e => startResize(e, 'e')} />
        <div style={edge({ top: 0, left: 0, width: E, height: E, cursor: 'nw-resize' })} onMouseDown={e => startResize(e, 'nw')} />
        <div style={edge({ top: 0, right: 0, width: E, height: E, cursor: 'ne-resize' })} onMouseDown={e => startResize(e, 'ne')} />
        <div style={edge({ bottom: 0, left: 0, width: E, height: E, cursor: 'sw-resize' })} onMouseDown={e => startResize(e, 'sw')} />
        <div style={edge({ bottom: 0, right: 0, width: E, height: E, cursor: 'se-resize' })} onMouseDown={e => startResize(e, 'se')} />
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-700 flex-shrink-0"
          style={{ cursor: 'move', userSelect: 'none' }} onMouseDown={startDrag}>
          <h3 className="text-base font-bold text-white">{title} — Data</h3>
          <button onClick={onClose} onMouseDown={e => e.stopPropagation()}
            className="text-zinc-300 hover:text-white transition-colors p-1 rounded hover:bg-zinc-700">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div style={{ overflow: 'auto', flex: 1 }}>
          <div style={{ minWidth: 'max-content' }}>{children}</div>
        </div>
      </div>
    </div>
  );
}

// ─── FUNNEL KPI CONFIG ────────────────────────────────────────────────────────
type KpiKey = 'ctr' | 'atc' | 'cvr';
const KPI_CONFIG: Record<KpiKey, { label: string; oursColor: string; marketColor: string; adjColor: string }> = {
  ctr: { label: 'CTR%', oursColor: '#06B6D4', marketColor: '#0E7490', adjColor: '#67E8F9' },
  atc: { label: 'ATC%', oursColor: '#F59E0B', marketColor: '#B45309', adjColor: '#FCD34D' },
  cvr: { label: 'CVR%', oursColor: '#8B5CF6', marketColor: '#6D28D9', adjColor: '#C4B5FD' },
};

function computeFunnelData(chartData: TrendRow[], brackets: PriceBracket[], priceAdjOn: boolean) {
  return chartData.map(r => {
    const ourCTR = r.ourImpressions > 0    ? (r.ourClicks      / r.ourImpressions)    * 100 : 0;
    const mktCTR = r.marketImpressions > 0 ? (r.marketClicks   / r.marketImpressions) * 100 : 0;
    const ourATC = r.ourClicks > 0         ? (r.ourCartAdds    / r.ourClicks)          * 100 : 0;
    const mktATC = r.marketClicks > 0      ? (r.marketCartAdds / r.marketClicks)       * 100 : 0;
    const ourCVR = r.ourClicks > 0         ? (r.ourPurchases   / r.ourClicks)          * 100 : 0;
    const mktCVR = r.marketClicks > 0      ? (r.marketPurchases/ r.marketClicks)       * 100 : 0;
    const ctrPremium = r.ourClickPrice    && r.marketClickPrice    ? ((r.ourClickPrice    / r.marketClickPrice)    - 1) * 100 : 0;
    const atcPremium = r.ourCartPrice     && r.marketCartPrice     ? ((r.ourCartPrice     / r.marketCartPrice)     - 1) * 100 : 0;
    const cvrPremium = r.ourPurchasePrice && r.marketPurchasePrice ? ((r.ourPurchasePrice / r.marketPurchasePrice) - 1) * 100 : 0;
    const ctrImpact = priceAdjOn ? getPremiumImpact(ctrPremium, brackets, 'ctr') / 100 : 0;
    const atcImpact = priceAdjOn ? getPremiumImpact(atcPremium, brackets, 'atc') / 100 : 0;
    const cvrImpact = priceAdjOn ? getPremiumImpact(cvrPremium, brackets, 'cvr') / 100 : 0;
    return {
      ...r,
      label: r.endDate ? fmtDate(r.endDate) : `W${r.periodNumber}/${r.year}`,
      ourCTR, mktCTR, adjMktCTR: mktCTR * (1 - ctrImpact),
      ourATC, mktATC, adjMktATC: mktATC * (1 - atcImpact),
      ourCVR, mktCVR, adjMktCVR: mktCVR * (1 - cvrImpact),
      ctrPremium, atcPremium, cvrPremium,
    };
  });
}

// ─── FUNNEL RATES CHART ───────────────────────────────────────────────────────
function FunnelRatesChart({ chartData, mode, hasFilter }: { chartData: TrendRow[]; mode: string; hasFilter: boolean }) {
  const [singleKpi, setSingleKpi]     = useState(false);
  const [activeKpi, setActiveKpi]     = useState<KpiKey>('ctr');
  const [priceAdjOn, setPriceAdjOn]   = useState(false);
  const [priceAdjExpanded, setPriceAdjExpanded] = useState(false);
  const [brackets, setBrackets]       = useState<PriceBracket[]>(DEFAULT_BRACKETS.map(b => ({ ...b })));
  const [modalOpen, setModalOpen]     = useState(false);
  const [previewWeek, setPreviewWeek] = useState<string>('');

  const data    = computeFunnelData(chartData, brackets, priceAdjOn);
  const cfg     = KPI_CONFIG[activeKpi];
  const oursKey = `our${activeKpi.toUpperCase()}` as 'ourCTR' | 'ourATC' | 'ourCVR';
  const mktKey  = `mkt${activeKpi.toUpperCase()}` as 'mktCTR' | 'mktATC' | 'mktCVR';
  const adjKey  = `adjMkt${activeKpi.toUpperCase()}` as 'adjMktCTR' | 'adjMktATC' | 'adjMktCVR';

  const totalOurClicks = chartData.reduce((s, r) => s + r.ourClicks, 0) || 1;
  const totalMktClicks = chartData.reduce((s, r) => s + r.marketClicks, 0) || 1;
  const totalOurCart   = chartData.reduce((s, r) => s + r.ourCartAdds, 0) || 1;
  const totalMktCart   = chartData.reduce((s, r) => s + r.marketCartAdds, 0) || 1;
  const totalOurPurch  = chartData.reduce((s, r) => s + r.ourPurchases, 0) || 1;
  const avgOurClick = chartData.reduce((s, r) => s + (r.ourClickPrice    ?? 0) * r.ourClicks,    0) / totalOurClicks;
  const avgMktClick = chartData.reduce((s, r) => s + (r.marketClickPrice ?? 0) * r.marketClicks, 0) / totalMktClicks;
  const avgOurCart  = chartData.reduce((s, r) => s + (r.ourCartPrice     ?? 0) * r.ourCartAdds,  0) / totalOurCart;
  const avgMktCart  = chartData.reduce((s, r) => s + (r.marketCartPrice  ?? 0) * r.marketCartAdds,0) / totalMktCart;
  const avgOurPurch = chartData.reduce((s, r) => s + (r.ourPurchasePrice ?? 0) * r.ourPurchases, 0) / totalOurPurch;
  const avgMktPurch = chartData.reduce((s, r) => s + (r.marketPurchasePrice ?? 0) * r.marketPurchases, 0) / (chartData.reduce((s, r) => s + r.marketPurchases, 0) || 1);

  const weekOptions  = [...chartData].reverse().map(r => ({ value: r.dateKey, label: `W${r.periodNumber}/${r.year} — ${fmtDate(r.endDate)}` }));
  const previewRow   = previewWeek ? chartData.find(r => r.dateKey === previewWeek) ?? null : null;
  const updateBracket = (i: number, field: keyof PriceBracket, val: string) => {
    setBrackets(prev => prev.map((b, idx) => idx === i ? { ...b, [field]: parseFloat(val) || 0 } : b));
  };
  const reversedData = [...data].reverse();

  const valCell = (val: number, wowPP: number | null, wowPct: number | null, color: string, borderLeft?: string) => (
    <td style={{ textAlign: 'center', padding: '7px 10px', verticalAlign: 'top', borderLeft: borderLeft || undefined }}>
      <div style={{ fontSize: 12, fontWeight: 700, color }}>{val.toFixed(2)}%</div>
      {wowPP !== null && <div style={{ fontSize: 10, fontWeight: 600, color: dc(wowPP) }}>{ds(wowPP)}{Math.abs(wowPP).toFixed(2)}pp</div>}
      {wowPct !== null && <div style={{ fontSize: 10, fontWeight: 500, color: dc(wowPct) }}>({wowPct >= 0 ? '+' : ''}{wowPct.toFixed(1)}%)</div>}
    </td>
  );
  const deltaCell = (ours: number, ref: number, borderLeft?: string) => {
    const diff = ours - ref; const pct = ref !== 0 ? (diff / Math.abs(ref)) * 100 : 0;
    return (
      <td style={{ textAlign: 'center', padding: '7px 10px', verticalAlign: 'top', borderLeft: borderLeft || undefined }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: dc(diff) }}>{ds(diff)}{Math.abs(diff).toFixed(2)}pp</div>
        <div style={{ fontSize: 10, fontWeight: 500, color: dc(pct) }}>({pct >= 0 ? '+' : ''}{pct.toFixed(1)}%)</div>
      </td>
    );
  };

  const FUNNEL_KPIS = [
    { key: 'ctr', label: 'CTR%', color: '#06b6d4', oursKey: 'ourCTR' as const, mktKey: 'mktCTR' as const, adjKey: 'adjMktCTR' as const },
    { key: 'atc', label: 'ATC%', color: '#f59e0b', oursKey: 'ourATC' as const, mktKey: 'mktATC' as const, adjKey: 'adjMktATC' as const },
    { key: 'cvr', label: 'CVR%', color: '#8b5cf6', oursKey: 'ourCVR' as const, mktKey: 'mktCVR' as const, adjKey: 'adjMktCVR' as const },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-white">Conversion Funnel Rates</h2>
            <p className="text-xs text-zinc-300 mt-0.5">CTR%, ATC% and CVR% — ours vs market</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap justify-end">
            <Toggle value={priceAdjOn} onChange={v => { setPriceAdjOn(v); if (v) setPriceAdjExpanded(true); }} label="Price Adjust" />
            <Toggle value={singleKpi} onChange={setSingleKpi} label="Single KPI" />
            {singleKpi && (
              <div className="flex gap-1 bg-zinc-700 rounded-lg p-1">
                {(Object.entries(KPI_CONFIG) as [KpiKey, typeof KPI_CONFIG[KpiKey]][]).map(([key, c]) => (
                  <button key={key} onClick={() => setActiveKpi(key)}
                    className={`px-4 py-1.5 rounded text-sm font-semibold transition-colors ${activeKpi === key ? 'bg-zinc-600' : 'text-zinc-400 hover:text-zinc-200'}`}
                    style={activeKpi === key ? { color: c.oursColor } : {}}>{c.label}</button>
                ))}
              </div>
            )}
            <button onClick={() => setModalOpen(true)} className="px-3 py-1.5 text-xs font-semibold text-orange-400 border border-zinc-600 rounded hover:border-orange-400 hover:text-orange-300 transition-colors">Show Data</button>
          </div>
        </div>

        {(() => {
          const latest = chartData.length > 0 ? chartData[chartData.length - 1] : null;
          const prev   = chartData.length > 1 ? chartData[chartData.length - 2] : null;
          if (!latest) return null;
          const fLatest = computeFunnelData([latest], brackets, priceAdjOn)[0];
          const fPrev   = prev ? computeFunnelData([prev], brackets, priceAdjOn)[0] : null;
          const pills = [
            { label: 'CTR%', ours: fLatest.ourCTR, mkt: fLatest.mktCTR, adj: fLatest.adjMktCTR, prevOurs: fPrev?.ourCTR ?? null, color: '#06B6D4', adjColor: '#67E8F9' },
            { label: 'ATC%', ours: fLatest.ourATC, mkt: fLatest.mktATC, adj: fLatest.adjMktATC, prevOurs: fPrev?.ourATC ?? null, color: '#F59E0B', adjColor: '#FCD34D' },
            { label: 'CVR%', ours: fLatest.ourCVR, mkt: fLatest.mktCVR, adj: fLatest.adjMktCVR, prevOurs: fPrev?.ourCVR ?? null, color: '#8B5CF6', adjColor: '#C4B5FD' },
          ];
          return (
            <div className="grid grid-cols-3 gap-3 mb-4">
              {pills.map(p => {
                const pp  = p.prevOurs !== null ? p.ours - p.prevOurs : null;
                const rel = pp !== null && p.prevOurs !== null && p.prevOurs !== 0 ? (pp / Math.abs(p.prevOurs)) * 100 : null;
                const pos = pp !== null && pp > 0;
                const mktDiff = p.mkt > 0 ? ((p.ours - p.mkt) / p.mkt) * 100 : null;
                const adjDiff = priceAdjOn && p.adj > 0 ? ((p.ours - p.adj) / p.adj) * 100 : null;
                return (
                  <div key={p.label} className="bg-zinc-700/50 border border-zinc-600 rounded-lg px-4 py-3">
                    <p className="text-xs font-bold text-zinc-200 uppercase tracking-wide mb-2">{p.label}</p>
                    <div className="flex items-baseline gap-4 flex-wrap">
                      <div><p className="text-xs font-semibold text-zinc-400 mb-0.5">Ours</p><p className="text-2xl font-bold text-yellow-400">{p.ours.toFixed(2)}%</p></div>
                      <div>
                        <p className="text-xs font-semibold text-zinc-400 mb-0.5">Market</p>
                        <p className="text-2xl font-bold text-white">{p.mkt.toFixed(2)}%</p>
                        {mktDiff !== null && <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${mktDiff >= 0 ? 'text-green-400 bg-green-500/10' : 'text-red-400 bg-red-500/10'}`}>{mktDiff >= 0 ? '↑' : '↓'}{mktDiff >= 0 ? '+' : ''}{mktDiff.toFixed(1)}%</span>}
                      </div>
                      {priceAdjOn && (
                        <div>
                          <p className="text-xs font-semibold text-zinc-400 mb-0.5">Adj.Market</p>
                          <p className="text-2xl font-bold" style={{ color: p.adjColor }}>{p.adj.toFixed(2)}%</p>
                          {adjDiff !== null && <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${adjDiff >= 0 ? 'text-green-400 bg-green-500/10' : 'text-red-400 bg-red-500/10'}`}>{adjDiff >= 0 ? '↑' : '↓'}{adjDiff >= 0 ? '+' : ''}{adjDiff.toFixed(1)}%</span>}
                        </div>
                      )}
                    </div>
                    {pp !== null && rel !== null && (
                      <p className={`text-xs font-semibold mt-2 ${Math.abs(pp) < 0.001 ? 'text-zinc-500' : pos ? 'text-green-400' : 'text-red-400'}`}>
                        {Math.abs(pp) < 0.001 ? 'No WoW change' : `WoW: ${pos ? '↑ +' : '↓ '}${pp.toFixed(2)}pp (${pos ? '+' : ''}${rel.toFixed(1)}%)`}
                      </p>
                    )}
                    <p className="text-xs text-zinc-500 mt-0.5">W{latest.periodNumber}/{latest.year}</p>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {priceAdjOn && (
          <div className="mb-4 border border-orange-900/40 rounded-lg overflow-hidden">
            <button onClick={() => setPriceAdjExpanded(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 bg-orange-950/20 hover:bg-orange-950/30 transition-colors">
              <div className="flex items-center gap-2">
                <svg className={`w-4 h-4 text-orange-400 transition-transform ${priceAdjExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                <span className="text-sm font-bold text-orange-400">Price Adjustment Settings</span>
                <span className="text-xs text-zinc-300 ml-1">— click to {priceAdjExpanded ? 'collapse' : 'expand'}</span>
              </div>
            </button>
            {priceAdjExpanded && (
              <div className="p-4 space-y-4 bg-zinc-800/50">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-zinc-700/60 rounded-lg p-3">
                    <p className="text-xs font-bold text-white mb-3 uppercase tracking-wide">Period Average Prices</p>
                    <div className="grid grid-cols-3 gap-3 text-xs">
                      {[{ label: 'Click Price', ours: avgOurClick, mkt: avgMktClick }, { label: 'Cart Price', ours: avgOurCart, mkt: avgMktCart }, { label: 'Purch. Price', ours: avgOurPurch, mkt: avgMktPurch }].map(({ label, ours, mkt }) => (
                        <div key={label}>
                          <p className="text-zinc-300 font-semibold mb-1">{label}</p>
                          <p className="text-white font-semibold">Ours: {fmtPrice(ours)}</p>
                          <p className="text-zinc-200">Mkt: {fmtPrice(mkt)}</p>
                          <p className={`font-semibold mt-1 ${ours > mkt ? 'text-orange-400' : 'text-green-400'}`}>{ours > 0 && mkt > 0 ? `${((ours / mkt - 1) * 100).toFixed(1)}% premium` : '—'}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="bg-zinc-700/60 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-bold text-white uppercase tracking-wide">Specific Week Prices</p>
                      <select value={previewWeek} onChange={e => setPreviewWeek(e.target.value)} className="text-xs bg-zinc-600 border border-zinc-600 rounded px-2 py-1 text-white outline-none">
                        <option value="">Select week...</option>
                        {weekOptions.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
                      </select>
                    </div>
                    {previewRow ? (
                      <div className="grid grid-cols-3 gap-3 text-xs">
                        {[{ label: 'Click Price', ours: previewRow.ourClickPrice, mkt: previewRow.marketClickPrice }, { label: 'Cart Price', ours: previewRow.ourCartPrice, mkt: previewRow.marketCartPrice }, { label: 'Purch. Price', ours: previewRow.ourPurchasePrice, mkt: previewRow.marketPurchasePrice }].map(({ label, ours, mkt }) => (
                          <div key={label}>
                            <p className="text-zinc-300 font-semibold mb-1">{label}</p>
                            <p className="text-white font-semibold">Ours: {fmtPrice(ours)}</p>
                            <p className="text-zinc-200">Mkt: {fmtPrice(mkt)}</p>
                            <p className={`font-semibold mt-1 ${(ours ?? 0) > (mkt ?? 0) ? 'text-orange-400' : 'text-green-400'}`}>{ours && mkt ? `${((ours / mkt - 1) * 100).toFixed(1)}% premium` : '—'}</p>
                          </div>
                        ))}
                      </div>
                    ) : <p className="text-zinc-400 text-xs mt-4">Select a week above to see prices</p>}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold text-white mb-2 uppercase tracking-wide">Impact Brackets</p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-zinc-600">
                        <th className="text-left px-3 py-2 text-zinc-200 font-bold">Price Premium</th>
                        <th className="text-center px-3 py-2 text-cyan-400 font-bold">CTR Impact %</th>
                        <th className="text-center px-3 py-2 text-yellow-400 font-bold">ATC Impact %</th>
                        <th className="text-center px-3 py-2 text-purple-400 font-bold">CVR Impact %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {brackets.map((b, i) => (
                        <tr key={i} className="border-b border-zinc-700/50">
                          <td className="px-3 py-2 text-white font-semibold">{b.label}</td>
                          {(['ctrImpact', 'atcImpact', 'cvrImpact'] as const).map(field => (
                            <td key={field} className="px-3 py-2 text-center">
                              <input type="number" value={b[field]} step="0.5" min="0" max="100"
                                onChange={e => updateBracket(i, field, e.target.value)}
                                className="w-16 bg-zinc-600 border border-zinc-600 rounded px-2 py-1 text-white text-center outline-none focus:border-orange-400 text-xs" />
                              <span className="text-zinc-300 ml-1">%</span>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button onClick={() => setBrackets(DEFAULT_BRACKETS.map(b => ({ ...b })))} className="mt-2 text-xs text-zinc-300 hover:text-white underline">Reset to defaults</button>
                </div>
              </div>
            )}
          </div>
        )}

        {data.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64"><p className="text-zinc-300 text-sm font-semibold">Select a Brand or Family to load data</p></div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
              <XAxis dataKey="label" tick={{ fill: '#a1a1aa', fontSize: 11 }} axisLine={{ stroke: '#374151' }} tickLine={false} />
              <YAxis yAxisId="volume" orientation="left" tick={{ fill: '#a1a1aa', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)} />
              <YAxis yAxisId="rate" orientation="right" tick={{ fill: '#a1a1aa', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `${v.toFixed(1)}%`} domain={[0, 'auto']} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '16px' }} formatter={value => <span style={{ color: '#d4d4d8' }}>{value}</span>} />
              <Bar yAxisId="volume" dataKey="searchVolume" name="Search Volume" fill="#2D4A6B" stroke="#3D6A9B" strokeWidth={1} radius={[2,2,0,0]} />
              {singleKpi ? (
                <>
                  <Line yAxisId="rate" type="monotone" dataKey={oursKey} name={`${cfg.label} (Ours)`} stroke={cfg.oursColor} strokeWidth={2} dot={false} />
                  <Line yAxisId="rate" type="monotone" dataKey={mktKey}  name={`${cfg.label} (Market)`} stroke={cfg.marketColor} strokeWidth={2} dot={false} strokeDasharray="5 3" />
                  {priceAdjOn && <Line yAxisId="rate" type="monotone" dataKey={adjKey} name={`${cfg.label} (Adj.Market)`} stroke={cfg.adjColor} strokeWidth={1.5} dot={false} strokeDasharray="2 2" />}
                </>
              ) : (
                <>
                  <Line yAxisId="rate" type="monotone" dataKey="ourCTR"    name="CTR% (Ours)"      stroke={KPI_CONFIG.ctr.oursColor}   strokeWidth={2} dot={false} />
                  <Line yAxisId="rate" type="monotone" dataKey="mktCTR"    name="CTR% (Market)"    stroke={KPI_CONFIG.ctr.marketColor} strokeWidth={2} dot={false} strokeDasharray="5 3" />
                  {priceAdjOn && <Line yAxisId="rate" type="monotone" dataKey="adjMktCTR" name="CTR% (Adj.Market)" stroke={KPI_CONFIG.ctr.adjColor} strokeWidth={1.5} dot={false} strokeDasharray="2 2" />}
                  <Line yAxisId="rate" type="monotone" dataKey="ourATC"    name="ATC% (Ours)"      stroke={KPI_CONFIG.atc.oursColor}   strokeWidth={2} dot={false} />
                  <Line yAxisId="rate" type="monotone" dataKey="mktATC"    name="ATC% (Market)"    stroke={KPI_CONFIG.atc.marketColor} strokeWidth={2} dot={false} strokeDasharray="5 3" />
                  {priceAdjOn && <Line yAxisId="rate" type="monotone" dataKey="adjMktATC" name="ATC% (Adj.Market)" stroke={KPI_CONFIG.atc.adjColor} strokeWidth={1.5} dot={false} strokeDasharray="2 2" />}
                  <Line yAxisId="rate" type="monotone" dataKey="ourCVR"    name="CVR% (Ours)"      stroke={KPI_CONFIG.cvr.oursColor}   strokeWidth={2} dot={false} />
                  <Line yAxisId="rate" type="monotone" dataKey="mktCVR"    name="CVR% (Market)"    stroke={KPI_CONFIG.cvr.marketColor} strokeWidth={2} dot={false} strokeDasharray="5 3" />
                  {priceAdjOn && <Line yAxisId="rate" type="monotone" dataKey="adjMktCVR" name="CVR% (Adj.Market)" stroke={KPI_CONFIG.cvr.adjColor} strokeWidth={1.5} dot={false} strokeDasharray="2 2" />}
                </>
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      <DataModal open={modalOpen} onClose={() => setModalOpen(false)} title="Conversion Funnel Rates">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 2, background: '#18181b' }}>
            <tr>
              <th rowSpan={2} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#fff', borderBottom: '2px solid rgba(255,255,255,0.25)', whiteSpace: 'nowrap' }}>Week</th>
              <th rowSpan={2} style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#fff', borderBottom: '2px solid rgba(255,255,255,0.25)', borderRight: '2px solid rgba(255,255,255,0.20)', whiteSpace: 'nowrap' }}>Search Vol</th>
              {FUNNEL_KPIS.map(g => (
                <React.Fragment key={g.key}>
                  <th colSpan={priceAdjOn ? 5 : 3} style={{ background: '#1e1e22', padding: '7px 10px 5px', textAlign: 'center', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', borderBottom: '2px solid rgba(255,255,255,0.25)', borderLeft: '2px solid rgba(255,255,255,0.20)', color: g.color, whiteSpace: 'nowrap' }}>{g.label}</th>
                </React.Fragment>
              ))}
            </tr>
            <tr style={{ background: '#1a1a1e', borderBottom: '2px solid rgba(255,255,255,0.25)' }}>
              {FUNNEL_KPIS.map(g => (
                <React.Fragment key={g.key}>
                  <th style={{ padding: '5px 8px', textAlign: 'center', fontSize: 10, fontWeight: 700, color: '#facc15', borderLeft: '2px solid rgba(255,255,255,0.20)', whiteSpace: 'nowrap' }}>Ours</th>
                  <th style={{ padding: '5px 8px', textAlign: 'center', fontSize: 10, fontWeight: 700, color: '#e4e4e7', whiteSpace: 'nowrap' }}>Market</th>
                  <th style={{ padding: '5px 8px', textAlign: 'center', fontSize: 10, fontWeight: 700, color: '#e4e4e7', whiteSpace: 'nowrap' }}>Mkt Delta</th>
                  {priceAdjOn && <>
                    <th style={{ padding: '5px 8px', textAlign: 'center', fontSize: 10, fontWeight: 700, color: '#93c5fd', borderLeft: '1px solid rgba(255,255,255,0.12)', whiteSpace: 'nowrap' }}>Adj. Market</th>
                    <th style={{ padding: '5px 8px', textAlign: 'center', fontSize: 10, fontWeight: 700, color: '#93c5fd', whiteSpace: 'nowrap' }}>Adj. Mkt Delta</th>
                  </>}
                </React.Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {reversedData.map((row, idx, arr) => {
              const prevRow = arr[idx + 1];
              return (
                <tr key={row.dateKey} style={{ borderBottom: '1px solid rgba(255,255,255,0.10)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#27272a')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding: '8px 14px', verticalAlign: 'top' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{`W${row.periodNumber}/${row.year}`}</div>
                    <div style={{ fontSize: 10, color: '#a1a1aa', marginTop: 1 }}>{row.endDate ? fmtDate(row.endDate) : row.dateKey}</div>
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#e4e4e7', borderRight: '2px solid rgba(255,255,255,0.20)', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{fmtK(row.searchVolume)}</td>
                  {FUNNEL_KPIS.map(g => {
                    const oursVal = row[g.oursKey]; const mktVal = row[g.mktKey]; const adjVal = row[g.adjKey];
                    const prevOurs = prevRow ? prevRow[g.oursKey] : null; const prevMkt = prevRow ? prevRow[g.mktKey] : null; const prevAdj = prevRow ? prevRow[g.adjKey] : null;
                    const oursWowPP  = prevOurs !== null ? oursVal - prevOurs : null;
                    const oursWowPct = oursWowPP !== null && prevOurs !== null && prevOurs !== 0 ? (oursWowPP / Math.abs(prevOurs)) * 100 : null;
                    const mktWowPP   = prevMkt  !== null ? mktVal  - prevMkt  : null;
                    const mktWowPct  = mktWowPP !== null && prevMkt !== null && prevMkt !== 0 ? (mktWowPP / Math.abs(prevMkt)) * 100 : null;
                    const adjWowPP   = prevAdj  !== null ? adjVal  - prevAdj  : null;
                    const adjWowPct  = adjWowPP !== null && prevAdj !== null && prevAdj !== 0 ? (adjWowPP / Math.abs(prevAdj)) * 100 : null;
                    return (
                      <React.Fragment key={g.key}>
                        {valCell(oursVal, oursWowPP, oursWowPct, '#facc15', '2px solid rgba(255,255,255,0.20)')}
                        {valCell(mktVal,  mktWowPP,  mktWowPct,  '#e4e4e7')}
                        {deltaCell(oursVal, mktVal)}
                        {priceAdjOn && <>{valCell(adjVal, adjWowPP, adjWowPct, '#93c5fd', '1px solid rgba(255,255,255,0.12)')}{deltaCell(oursVal, adjVal)}</>}
                      </React.Fragment>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </DataModal>
    </div>
  );
}

// ─── MEDIAN PRICE CHART ───────────────────────────────────────────────────────
type PriceKpiKey = 'click' | 'atc' | 'purchase';
const PRICE_KPI_CONFIG: Record<PriceKpiKey, { label: string; oursKey: keyof TrendRow; mktKey: keyof TrendRow; oursColor: string; mktColor: string }> = {
  click:    { label: 'Click Price',    oursKey: 'ourClickPrice',    mktKey: 'marketClickPrice',    oursColor: '#06B6D4', mktColor: '#0E7490' },
  atc:      { label: 'ATC Price',      oursKey: 'ourCartPrice',     mktKey: 'marketCartPrice',     oursColor: '#F59E0B', mktColor: '#B45309' },
  purchase: { label: 'Purchase Price', oursKey: 'ourPurchasePrice', mktKey: 'marketPurchasePrice', oursColor: '#8B5CF6', mktColor: '#6D28D9' },
};

function MedianPriceChart({ chartData, mode }: { chartData: TrendRow[]; mode: string; hasFilter: boolean }) {
  const [singleKpi, setSingleKpi] = useState(false);
  const [activeKpi, setActiveKpi] = useState<PriceKpiKey>('click');
  const [modalOpen, setModalOpen] = useState(false);

  const formatted = chartData.map(r => ({
    ...r, label: mode === 'monthly' ? `${r.periodNumber}/${r.year}` : (r.endDate ? fmtDate(r.endDate) : `W${r.periodNumber}/${r.year}`),
  }));

  const findLatestWithPrice = (oursKey: keyof TrendRow, mktKey: keyof TrendRow) => {
    for (let i = chartData.length - 1; i >= 0; i--) {
      const r = chartData[i];
      if ((r[oursKey] as number) > 0 || (r[mktKey] as number) > 0) return { latest: r, prev: i > 0 ? chartData[i - 1] : null };
    }
    return { latest: null, prev: null };
  };
  const clickRef    = findLatestWithPrice('ourClickPrice',    'marketClickPrice');
  const atcRef      = findLatestWithPrice('ourCartPrice',     'marketCartPrice');
  const purchaseRef = findLatestWithPrice('ourPurchasePrice', 'marketPurchasePrice');

  const pillDefs = [
    { key: 'click',    label: 'Click Price',    ours: clickRef.latest?.ourClickPrice ?? null,       mkt: clickRef.latest?.marketClickPrice ?? null,       prevOurs: clickRef.prev?.ourClickPrice ?? null,       weekLabel: clickRef.latest    ? `W${clickRef.latest.periodNumber}/${clickRef.latest.year}` : '' },
    { key: 'atc',      label: 'ATC Price',      ours: atcRef.latest?.ourCartPrice ?? null,          mkt: atcRef.latest?.marketCartPrice ?? null,           prevOurs: atcRef.prev?.ourCartPrice ?? null,           weekLabel: atcRef.latest      ? `W${atcRef.latest.periodNumber}/${atcRef.latest.year}` : '' },
    { key: 'purchase', label: 'Purchase Price', ours: purchaseRef.latest?.ourPurchasePrice ?? null, mkt: purchaseRef.latest?.marketPurchasePrice ?? null,  prevOurs: purchaseRef.prev?.ourPurchasePrice ?? null,  weekLabel: purchaseRef.latest ? `W${purchaseRef.latest.periodNumber}/${purchaseRef.latest.year}` : '' },
  ];

  const activeLines  = singleKpi ? [PRICE_KPI_CONFIG[activeKpi]] : Object.values(PRICE_KPI_CONFIG);
  const reversedData = [...chartData].reverse();

  const PRICE_KPIS = [
    { key: 'click',    label: 'Click Price',    color: '#06b6d4', oursKey: 'ourClickPrice'    as keyof TrendRow, mktKey: 'marketClickPrice'    as keyof TrendRow },
    { key: 'atc',      label: 'ATC Price',      color: '#f59e0b', oursKey: 'ourCartPrice'     as keyof TrendRow, mktKey: 'marketCartPrice'     as keyof TrendRow },
    { key: 'purchase', label: 'Purchase Price', color: '#8b5cf6', oursKey: 'ourPurchasePrice' as keyof TrendRow, mktKey: 'marketPurchasePrice' as keyof TrendRow },
  ];

  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-white">Median Price Tracking</h2>
          <p className="text-xs text-zinc-300 mt-0.5">Click, ATC &amp; Purchase price — ours vs market</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap justify-end">
          <Toggle value={singleKpi} onChange={setSingleKpi} label="Single KPI" />
          {singleKpi && (
            <div className="flex gap-1 bg-zinc-700 rounded-lg p-1">
              {(Object.entries(PRICE_KPI_CONFIG) as [PriceKpiKey, typeof PRICE_KPI_CONFIG[PriceKpiKey]][]).map(([key, c]) => (
                <button key={key} onClick={() => setActiveKpi(key)}
                  className={`px-3 py-1.5 rounded text-sm font-semibold transition-colors ${activeKpi === key ? 'bg-zinc-600' : 'text-zinc-400 hover:text-zinc-200'}`}
                  style={activeKpi === key ? { color: c.oursColor } : {}}>{c.label}</button>
              ))}
            </div>
          )}
          <button onClick={() => setModalOpen(true)} className="px-3 py-1.5 text-xs font-semibold text-orange-400 border border-zinc-600 rounded hover:border-orange-400 hover:text-orange-300 transition-colors">Show Data</button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        {pillDefs.map(p => {
          const hasOurs = p.ours != null && p.ours > 0;
          const hasMkt  = p.mkt  != null && p.mkt  > 0;
          const mktDiff = hasOurs && hasMkt ? ((p.ours! - p.mkt!) / p.mkt!) * 100 : null;
          const wowDiff = hasOurs && p.prevOurs != null && p.prevOurs > 0 ? p.ours! - p.prevOurs : null;
          const wowRel  = wowDiff !== null && p.prevOurs != null && p.prevOurs > 0 ? (wowDiff / p.prevOurs) * 100 : null;
          const wowPos  = wowDiff !== null && wowDiff > 0;
          return (
            <div key={p.key} className="bg-zinc-700/50 border border-zinc-600 rounded-lg px-4 py-3">
              <p className="text-xs font-bold text-zinc-200 uppercase tracking-wide mb-2">{p.label}</p>
              <div className="flex items-baseline gap-4 flex-wrap">
                <div><p className="text-xs font-semibold text-zinc-400 mb-0.5">Ours</p><p className="text-2xl font-bold text-yellow-400">{fmtPrice(p.ours)}</p></div>
                <div>
                  <p className="text-xs font-semibold text-zinc-400 mb-0.5">Market</p>
                  <p className="text-2xl font-bold text-white">{fmtPrice(p.mkt)}</p>
                  {mktDiff !== null && <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${mktDiff >= 0 ? 'text-green-400 bg-green-500/10' : 'text-red-400 bg-red-500/10'}`}>{mktDiff >= 0 ? '↑' : '↓'} {mktDiff >= 0 ? '+' : ''}{mktDiff.toFixed(1)}%</span>}
                </div>
              </div>
              {wowDiff !== null && wowRel !== null && (
                <p className={`text-xs font-semibold mt-2 ${Math.abs(wowDiff) < 0.001 ? 'text-zinc-500' : wowPos ? 'text-green-400' : 'text-red-400'}`}>
                  {Math.abs(wowDiff) < 0.001 ? 'No WoW change' : `WoW: ${wowPos ? '↑ +' : '↓ '}$${Math.abs(wowDiff).toFixed(2)} (${wowPos ? '+' : ''}${wowRel.toFixed(1)}%)`}
                </p>
              )}
              {p.weekLabel && <p className="text-xs text-zinc-500 mt-0.5">{p.weekLabel}</p>}
            </div>
          );
        })}
      </div>

      {chartData.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64"><p className="text-zinc-300 text-sm font-semibold">Select a Brand or Family to load data</p></div>
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={formatted} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#a1a1aa' }} tickLine={false} axisLine={{ stroke: '#3f3f46' }} />
            <YAxis yAxisId="vol" orientation="left" tickFormatter={n => n >= 1000 ? `${(n/1000).toFixed(0)}K` : String(n)} tick={{ fontSize: 11, fill: '#a1a1aa' }} tickLine={false} axisLine={false} />
            <YAxis yAxisId="price" orientation="right" tickFormatter={n => `$${n.toFixed(0)}`} tick={{ fontSize: 11, fill: '#a1a1aa' }} tickLine={false} axisLine={false} />
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '12px' }} formatter={value => <span style={{ color: '#d4d4d8' }}>{value}</span>} />
            <Bar yAxisId="vol" dataKey="searchVolume" name="Search Volume" fill="#3b82f6" opacity={0.25} radius={[2,2,0,0]} />
            {activeLines.map(cfg => [
              <Line key={`${cfg.label}-ours`} yAxisId="price" type="monotone" dataKey={cfg.oursKey as string} name={`${cfg.label} (Ours)`} stroke={cfg.oursColor} strokeWidth={2} dot={false} connectNulls />,
              <Line key={`${cfg.label}-mkt`}  yAxisId="price" type="monotone" dataKey={cfg.mktKey as string}  name={`${cfg.label} (Market)`} stroke={cfg.mktColor} strokeWidth={2} dot={false} strokeDasharray="5 3" connectNulls />,
            ])}
          </ComposedChart>
        </ResponsiveContainer>
      )}
      <p className="text-xs text-zinc-400 mt-2">Solid lines = Ours &nbsp;·&nbsp; Dashed lines = Market</p>

      <DataModal open={modalOpen} onClose={() => setModalOpen(false)} title="Median Price Tracking">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 2, background: '#18181b' }}>
            <tr>
              <th rowSpan={2} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#fff', borderBottom: '2px solid rgba(255,255,255,0.25)', whiteSpace: 'nowrap' }}>Week</th>
              <th rowSpan={2} style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: '#fff', borderBottom: '2px solid rgba(255,255,255,0.25)', borderRight: '2px solid rgba(255,255,255,0.20)', whiteSpace: 'nowrap' }}>Search Vol</th>
              {PRICE_KPIS.map(g => (
                <th key={g.key} colSpan={3} style={{ background: '#1e1e22', padding: '7px 10px 4px', textAlign: 'center', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', borderBottom: '2px solid rgba(255,255,255,0.25)', borderLeft: '2px solid rgba(255,255,255,0.20)', color: g.color, whiteSpace: 'nowrap' }}>{g.label}</th>
              ))}
            </tr>
            <tr style={{ background: '#1a1a1e', borderBottom: '2px solid rgba(255,255,255,0.25)' }}>
              {PRICE_KPIS.map(g => (
                <React.Fragment key={g.key}>
                  <th style={{ padding: '5px 8px', textAlign: 'center', fontWeight: 700, color: '#facc15', borderLeft: '2px solid rgba(255,255,255,0.20)', whiteSpace: 'nowrap' }}>Ours</th>
                  <th style={{ padding: '5px 8px', textAlign: 'center', fontWeight: 700, color: '#e4e4e7', whiteSpace: 'nowrap' }}>Market</th>
                  <th style={{ padding: '5px 8px', textAlign: 'center', fontWeight: 700, color: '#e4e4e7', whiteSpace: 'nowrap' }}>Mkt Delta</th>
                </React.Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {reversedData.map((row, idx, arr) => {
              const prevRow = arr[idx + 1];
              const weekLabel = mode === 'monthly' ? `${row.periodNumber}/${row.year}` : `W${row.periodNumber}/${row.year}`;
              return (
                <tr key={row.dateKey} style={{ borderBottom: '1px solid rgba(255,255,255,0.10)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#27272a')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding: '8px 14px', verticalAlign: 'top' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{weekLabel}</div>
                    <div style={{ fontSize: 10, color: '#a1a1aa', marginTop: 1 }}>{row.endDate ? fmtDate(row.endDate) : ''}</div>
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#e4e4e7', borderRight: '2px solid rgba(255,255,255,0.20)', verticalAlign: 'top' }}>{fmtK(row.searchVolume)}</td>
                  {PRICE_KPIS.map(g => {
                    const oursVal  = row[g.oursKey] as number | null;
                    const mktVal   = row[g.mktKey]  as number | null;
                    const prevOurs = prevRow ? prevRow[g.oursKey] as number | null : null;
                    const prevMkt  = prevRow ? prevRow[g.mktKey]  as number | null : null;
                    const oursWow  = oursVal && prevOurs && prevOurs > 0 ? ((oursVal - prevOurs) / prevOurs) * 100 : null;
                    const mktWow   = mktVal  && prevMkt  && prevMkt  > 0 ? ((mktVal  - prevMkt)  / prevMkt)  * 100 : null;
                    const diff     = oursVal && mktVal ? oursVal - mktVal : null;
                    const diffPct  = diff !== null && mktVal ? (diff / Math.abs(mktVal)) * 100 : null;
                    return (
                      <React.Fragment key={g.key}>
                        <td style={{ padding: '8px 10px', textAlign: 'center', verticalAlign: 'top', borderLeft: '2px solid rgba(255,255,255,0.20)' }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#facc15' }}>{fmtPrice(oursVal)}</div>
                          {oursWow !== null && <div style={{ fontSize: 10, fontWeight: 600, color: dc(oursWow) }}>{ds(oursWow)}{Math.abs(oursWow).toFixed(1)}%</div>}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'center', verticalAlign: 'top' }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#e4e4e7' }}>{fmtPrice(mktVal)}</div>
                          {mktWow !== null && <div style={{ fontSize: 10, fontWeight: 600, color: dc(mktWow) }}>{ds(mktWow)}{Math.abs(mktWow).toFixed(1)}%</div>}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'center', verticalAlign: 'top' }}>
                          {diff !== null && diffPct !== null
                            ? <><div style={{ fontSize: 11, fontWeight: 700, color: dc(diff) }}>{diff >= 0 ? '+' : '-'}${Math.abs(diff).toFixed(2)}</div><div style={{ fontSize: 10, fontWeight: 500, color: dc(diffPct) }}>({diffPct >= 0 ? '+' : ''}{diffPct.toFixed(1)}%)</div></>
                            : <span style={{ color: '#71717a' }}>—</span>}
                        </td>
                      </React.Fragment>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </DataModal>
    </div>
  );
}

// ─── GRAPH 1 KPI CONFIG ───────────────────────────────────────────────────────
const G1_KPIS = [
  { key: 'imp',  label: 'Impressions', color: '#6366f1', mktKey: 'marketImpressions' as keyof TrendRow, oursKey: 'ourImpressions' as keyof TrendRow, shareKey: 'impressionShare' as keyof TrendRow },
  { key: 'clk',  label: 'Clicks',      color: '#06b6d4', mktKey: 'marketClicks'      as keyof TrendRow, oursKey: 'ourClicks'      as keyof TrendRow, shareKey: 'clickShare'      as keyof TrendRow },
  { key: 'cart', label: 'Cart Adds',   color: '#f97316', mktKey: 'marketCartAdds'    as keyof TrendRow, oursKey: 'ourCartAdds'    as keyof TrendRow, shareKey: 'cartAddShare'    as keyof TrendRow },
  { key: 'pur',  label: 'Purchases',   color: '#a855f7', mktKey: 'marketPurchases'   as keyof TrendRow, oursKey: 'ourPurchases'   as keyof TrendRow, shareKey: 'purchaseShare'   as keyof TrendRow },
];

// ─── BRANDED TERMS KPIS ───────────────────────────────────────────────────────
const BR_KPIS = [
  { key: 'imp',  label: 'Impressions', color: '#6366f1', mktKey: 'mktImpressions' as keyof BrandedTermRow, oursKey: 'ourImpressions' as keyof BrandedTermRow, isCcy: false },
  { key: 'clk',  label: 'Clicks',      color: '#06b6d4', mktKey: 'mktClicks'       as keyof BrandedTermRow, oursKey: 'ourClicks'       as keyof BrandedTermRow, isCcy: false },
  { key: 'cart', label: 'Cart Adds',   color: '#f97316', mktKey: 'mktCartAdds'     as keyof BrandedTermRow, oursKey: 'ourCartAdds'     as keyof BrandedTermRow, isCcy: false },
  { key: 'pur',  label: 'Purchases',   color: '#a855f7', mktKey: 'mktPurchases'    as keyof BrandedTermRow, oursKey: 'ourPurchases'    as keyof BrandedTermRow, isCcy: false },
  { key: 'rev',  label: 'Revenue',     color: '#22c55e', mktKey: 'mktRevenue'      as keyof BrandedTermRow, oursKey: 'ourRevenue'      as keyof BrandedTermRow, isCcy: true  },
];

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function TrendsPage() {
  const {
    mode, setMode,
    selBrands, setSelBrands,
    selFamilies, setSelFamilies,
    selAsins, setSelAsins,
    startWeek, setStartWeek,
    endWeek, setEndWeek,
    startMonth, setStartMonth,
    endMonth, setEndMonth,
  } = useFilters();

  const [brands, setBrands]           = useState<FilterOption[]>([]);
  const [families, setFamilies]       = useState<FilterOption[]>([]);
  const [asinOptions, setAsinOptions] = useState<FilterOption[]>([]);
  const [chartData, setChartData]     = useState<TrendRow[]>([]);
  const [loading, setLoading]         = useState(false);
  const [singleKpi1, setSingleKpi1]   = useState(false);
  const [activeKpi1, setActiveKpi1]   = useState<'impressionShare' | 'clickShare' | 'cartAddShare' | 'purchaseShare' | 'revenueShare'>('impressionShare');
  const [modal1Open, setModal1Open]   = useState(false);
  const [expandedKpis, setExpandedKpis] = useState<Set<string>>(new Set());

  // ── Keyword mode — independent per tab ────────────────────────────────────
  const [kwModeWeekly,  setKwModeWeekly]  = useState<KwMode>('both');
  const [kwModeMonthly, setKwModeMonthly] = useState<KwMode>('both');
  const kwMode    = mode === 'weekly' ? kwModeWeekly : kwModeMonthly;
  const setKwMode = useCallback((m: KwMode) => {
    if (mode === 'weekly') setKwModeWeekly(m); else setKwModeMonthly(m);
  }, [mode]);

  // ── Branded Terms Modal ───────────────────────────────────────────────────
  const [brandedOpen,        setBrandedOpen]        = useState(false);
  const [brandedData,        setBrandedData]        = useState<BrandedTermRow[]>([]);
  const [loadingBranded,     setLoadingBranded]     = useState(false);
  const [selBrandedPeriods,  setSelBrandedPeriods]  = useState<string[]>([]);
  const [expandedBrKpis,     setExpandedBrKpis]     = useState<Set<string>>(new Set());
  const [brandedDDOpen,      setBrandedDDOpen]      = useState(false);
  const brandedDDRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (brandedDDRef.current && !brandedDDRef.current.contains(e.target as Node)) setBrandedDDOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);

  const autoSelectDone       = useRef(false);
  const familiesInitialized  = useRef(false);
  const autoSelectInProgress = useRef(false);
  const selBrand = selBrands.length > 0 ? selBrands[0] : '';
  const DEFAULT_START_WEEK = ALL_WEEKS[Math.min(29, ALL_WEEKS.length - 1)];
  const DEFAULT_END_WEEK   = ALL_WEEKS[0];

  const toggleKpi = useCallback((kpi: string) => {
    setExpandedKpis(prev => { const n = new Set(prev); n.has(kpi) ? n.delete(kpi) : n.add(kpi); return n; });
  }, []);

  const toggleBrKpi = useCallback((kpi: string) => {
    setExpandedBrKpis(prev => { const n = new Set(prev); n.has(kpi) ? n.delete(kpi) : n.add(kpi); return n; });
  }, []);

  const autoSelectTopFamily = useCallback(async (brand: string) => {
    try {
      const res = await fetch(`/api/dashboard/filters?type=top-family&brand=${encodeURIComponent(brand)}`);
      const d   = await res.json();
      if (d.family) setSelFamilies([d.family]);
    } catch { /* silent */ }
  }, [setSelFamilies]);

  useEffect(() => {
    fetch('/api/dashboard/filters?type=brands').then(r => r.json()).then(d => {
      const opts = (d.brands ?? []).map((b: string) => ({ value: b, label: b }));
      setBrands(opts);
      if (opts.length > 0 && !autoSelectDone.current) {
        autoSelectDone.current = true;
        try {
          const saved = sessionStorage.getItem('sqp_dashboard_filters');
          const parsed = saved ? JSON.parse(saved) : null;
          const brandToUse = parsed?.selBrands?.[0] ?? opts[0].value;
          if (selBrands.length === 0) {
            setStartWeek(DEFAULT_START_WEEK); setEndWeek(DEFAULT_END_WEEK);
            autoSelectInProgress.current = true;
            setSelBrands([brandToUse]);
            autoSelectTopFamily(brandToUse).then(() => { autoSelectInProgress.current = false; });
          }
        } catch {
          setStartWeek(DEFAULT_START_WEEK); setEndWeek(DEFAULT_END_WEEK);
          autoSelectInProgress.current = true;
          setSelBrands([opts[0].value]);
          autoSelectTopFamily(opts[0].value).then(() => { autoSelectInProgress.current = false; });
        }
      }
    });
  }, []);

  useEffect(() => {
    const params = selBrands.length > 0 ? `&brands=${selBrands.join(',')}` : '';
    fetch(`/api/dashboard/filters?type=families${params}`).then(r => r.json())
      .then(d => setFamilies((d.families ?? []).map((f: { family_name: string }) => ({ value: f.family_name, label: f.family_name }))));
  }, [selBrands]);

  useEffect(() => {
    const fp = selFamilies.length > 0 ? `families=${selFamilies.join(',')}` : '';
    const bp = selBrands.length   > 0 ? `brands=${selBrands.join(',')}`     : '';
    const p  = fp || bp;
    if (!p) { setAsinOptions([]); return; }
    fetch(`/api/dashboard/filters?type=asins&${p}`).then(r => r.json()).then(d => {
      setAsinOptions((d.asins ?? []).map((a: { child_asin: string; product_name: string }) => ({ value: a.child_asin, label: a.product_name || a.child_asin })));
      if (familiesInitialized.current) setSelAsins([]);
      else familiesInitialized.current = true;
    });
  }, [selFamilies, selBrands]);

  const handleBrandChange = useCallback((brand: string) => {
    autoSelectInProgress.current = true;
    setSelBrands([brand]); setSelFamilies([]); setSelAsins([]);
    autoSelectTopFamily(brand).then(() => { autoSelectInProgress.current = false; });
  }, [setSelBrands, setSelFamilies, setSelAsins, autoSelectTopFamily]);

  const hasFilter = selBrands.length > 0 || selFamilies.length > 0 || selAsins.length > 0;

  const fetchData = useCallback(async () => {
    if (!hasFilter) { setChartData([]); return; }
    if (autoSelectInProgress.current) return;
    setLoading(true);
    try {
      const res = await fetch('/api/dashboard/trends', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asins: selAsins, families: selFamilies, brands: selBrands,
          startDate: mode === 'weekly' ? startWeek.start : startMonth.start,
          endDate:   mode === 'weekly' ? endWeek.end     : endMonth.end,
          mode, kwMode,
        }),
      });
      const json = await res.json();
      setChartData(json.data ?? []);
    } finally { setLoading(false); }
  }, [selAsins, selFamilies, selBrands, startWeek, endWeek, startMonth, endMonth, mode, hasFilter, kwMode]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Fetch branded terms (for the branded terms modal) ────────────────────
  const fetchBrandedTerms = useCallback(async () => {
    if (!hasFilter) return;
    setLoadingBranded(true);
    try {
      const res = await fetch('/api/dashboard/branded-terms', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brands: selBrand ? [selBrand] : [], families: selFamilies, asins: selAsins,
          mode,
          startDate: mode === 'weekly' ? startWeek.start : startMonth.start,
          endDate:   mode === 'weekly' ? endWeek.end     : endMonth.end,
        }),
      });
      const d = await res.json();
      const data: BrandedTermRow[] = d.data ?? [];
      setBrandedData(data);
      // Default: select the latest period only
      const uniquePeriods = [...new Set(data.map(r => r.weekKey))].sort().reverse();
      setSelBrandedPeriods(uniquePeriods.slice(0, 1));
    } catch { setBrandedData([]); }
    finally { setLoadingBranded(false); }
  }, [selBrand, selFamilies, selAsins, mode, startWeek, endWeek, startMonth, endMonth, hasFilter]);

  // Re-fetch branded terms when modal opens or filters change while open
  useEffect(() => {
    if (brandedOpen) fetchBrandedTerms();
  }, [fetchBrandedTerms, brandedOpen]);

  // ── Branded terms modal derived data ────────────────────────────────────
  const brandedPeriodOptions = [...new Set(brandedData.map(r => r.weekKey))]
    .sort().reverse()
    .map(k => {
      const row = brandedData.find(r => r.weekKey === k)!;
      return {
        value: k,
        label: mode === 'monthly'
          ? `${row.weekNumber}/${row.year}`
          : `W${row.weekNumber}/${row.year} — ${fmtDate(row.weekEnd)}`,
      };
    });

  // Rows filtered to selected periods, sorted by searchVolume DESC then weekKey DESC
  const filteredBrandedRows = brandedData
    .filter(r => selBrandedPeriods.includes(r.weekKey))
    .sort((a, b) => b.searchVolume - a.searchVolume || b.weekKey.localeCompare(a.weekKey));

  const sortedSelPeriods = [...selBrandedPeriods].sort();

  function getBrandedPriorRow(row: BrandedTermRow): BrandedTermRow | null {
    const idx = sortedSelPeriods.indexOf(row.weekKey);
    if (idx <= 0) return null;
    const priorKey = sortedSelPeriods[idx - 1];
    return brandedData.find(r => r.searchTerm === row.searchTerm && r.weekKey === priorKey) ?? null;
  }

  // ── Chart data ───────────────────────────────────────────────────────────
  const formattedChartData = chartData.map(r => {
    const ourRev = r.ourPurchases * (r.ourPurchasePrice ?? 0);
    const mktRev = r.marketPurchases * (r.marketPurchasePrice ?? 0);
    return {
      ...r,
      label: mode === 'monthly' ? `${r.periodNumber}/${r.year}` : (r.endDate ? fmtDate(r.endDate) : `W${r.periodNumber}/${r.year}`),
      revenueShare: mktRev > 0 ? (ourRev / mktRev) * 100 : 0,
    };
  });

  const latest = chartData.length > 0 ? chartData[chartData.length - 1] : null;
  const prev   = chartData.length > 1 ? chartData[chartData.length - 2] : null;

  const calcRevShare = (r: TrendRow) => {
    const ourRev = r.ourPurchases * (r.ourPurchasePrice ?? 0);
    const mktRev = r.marketPurchases * (r.marketPurchasePrice ?? 0);
    return { ourRev, mktRev, share: mktRev > 0 ? (ourRev / mktRev) * 100 : 0 };
  };

  const latestRevShare = latest ? calcRevShare(latest) : null;
  const prevRevShare   = prev   ? calcRevShare(prev)   : null;

  const g1Pill = (shareKey: keyof TrendRow, mktKey: keyof TrendRow, oursKey: keyof TrendRow) => {
    if (!latest) return null;
    const shareVal  = latest[shareKey]  as number;
    const prevShare = prev ? prev[shareKey] as number : null;
    const mktVal    = latest[mktKey]    as number;
    const prevMkt   = prev ? prev[mktKey]   as number : null;
    const oursVal   = latest[oursKey]   as number;
    const prevOurs  = prev ? prev[oursKey]  as number : null;
    const sharePP   = prevShare !== null ? shareVal - prevShare : null;
    const sharePct  = sharePP !== null && prevShare !== null && prevShare !== 0 ? (sharePP / Math.abs(prevShare)) * 100 : null;
    const mktWow    = prevMkt  && prevMkt  > 0 ? ((mktVal  - prevMkt)  / prevMkt)  * 100 : null;
    const oursWow   = prevOurs && prevOurs > 0 ? ((oursVal - prevOurs) / prevOurs) * 100 : null;
    return { shareVal, mktVal, oursVal, sharePP, sharePct, mktWow, oursWow };
  };

  const impPill  = g1Pill('impressionShare', 'marketImpressions', 'ourImpressions');
  const clkPill  = g1Pill('clickShare',      'marketClicks',      'ourClicks');
  const cartPill = g1Pill('cartAddShare',    'marketCartAdds',    'ourCartAdds');
  const purPill  = g1Pill('purchaseShare',   'marketPurchases',   'ourPurchases');
  const periodLabel    = latest ? (mode === 'monthly' ? `${latest.periodNumber}/${latest.year}` : `W${latest.periodNumber}/${latest.year}`) : '';
  const g1ReversedData = [...chartData].reverse();

  const WB = '2px solid rgba(255,255,255,0.20)';
  const HB = '2px solid rgba(255,255,255,0.25)';
  const RB = '1px solid rgba(255,255,255,0.10)';

  const badge = KW_BADGE[kwMode];

  // ── Branded terms table helpers ──────────────────────────────────────────
  const brShareCell = (share: number, prevShare: number | undefined) => {
    const pp    = prevShare !== undefined ? share - prevShare : null;
    const ppPct = pp !== null && prevShare && prevShare !== 0 ? (pp / Math.abs(prevShare)) * 100 : null;
    const dColor = pp === null || Math.abs(pp) < 0.001 ? '#71717a' : pp > 0 ? '#4ade80' : '#f87171';
    return (
      <td style={{ padding: '8px 10px', textAlign: 'center', verticalAlign: 'top', borderLeft: WB, borderBottom: RB }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>{share.toFixed(1)}%</div>
        {pp !== null && Math.abs(pp) >= 0.001 && <>
          <div style={{ fontSize: 10, fontWeight: 700, color: dColor }}>{pp > 0 ? '↑ +' : '↓ '}{Math.abs(pp).toFixed(2)}pp</div>
          {ppPct !== null && <div style={{ fontSize: 10, fontWeight: 600, color: dColor }}>({ppPct >= 0 ? '+' : ''}{ppPct.toFixed(1)}%)</div>}
        </>}
        {pp === null && <div style={{ fontSize: 10, color: '#52525b' }}>—</div>}
      </td>
    );
  };

  const brValCell = (val: number, prevVal: number | undefined, color: string, isCcy: boolean) => {
    const wow = prevVal !== undefined && prevVal > 0 ? ((val - prevVal) / prevVal) * 100 : null;
    const display = isCcy ? fmtRev(val) : fmtK(val);
    return (
      <td style={{ padding: '8px 10px', textAlign: 'center', verticalAlign: 'top', borderLeft: '1px solid rgba(255,255,255,0.10)', borderBottom: RB }}>
        <div style={{ fontSize: 12, fontWeight: 700, color }}>{display}</div>
        {wow !== null ? <div style={{ fontSize: 10, fontWeight: 600, color: dc(wow) }}>{ds(wow)}{Math.abs(wow).toFixed(1)}%</div> : <div style={{ fontSize: 10, color: '#52525b' }}>—</div>}
      </td>
    );
  };

  return (
    <div className="min-h-screen bg-zinc-900 text-white">
      <div className="border-b border-zinc-700 px-8 py-5">
        <h1 className="text-xl font-bold text-white">Trends</h1>
        <p className="text-sm text-zinc-200 mt-1">Week over week and month over month performance analysis</p>
      </div>
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

        {/* ── FILTER BAR ── */}
        <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4">
          <div className="flex flex-wrap gap-4 items-end">
            <BrandSelect options={brands} selected={selBrand} onChange={handleBrandChange} />
            <MultiSelect label="Family" options={families} selected={selFamilies} onChange={v => { setSelFamilies(v); setSelAsins([]); }} disabled={brands.length === 0} />
            <MultiSelect label="Product (ASIN)" options={asinOptions} selected={selAsins} onChange={setSelAsins} disabled={asinOptions.length === 0} />
            {mode === 'weekly' && (
              <>
                <WeekDropdown label="Start Week" value={startWeek} onChange={w => { setStartWeek(w); if (w.start > endWeek.start) setEndWeek(w); }} />
                <WeekDropdown label="End Week"   value={endWeek}   onChange={setEndWeek} maxWeek={startWeek} />
              </>
            )}
            {mode === 'monthly' && (
              <>
                <MonthDropdown label="Start Month" value={startMonth} onChange={m => { setStartMonth(m); if (m.start > endMonth.start) setEndMonth(m); }} />
                <MonthDropdown label="End Month"   value={endMonth}   onChange={setEndMonth} maxMonth={startMonth} />
              </>
            )}

            {/* ── 3-OPTION KEYWORD MODE SELECTOR ── */}
            <div className="flex flex-col gap-1">
              <span className="text-xs font-bold text-white uppercase tracking-wide">Keyword Type</span>
              <div className="flex bg-zinc-900 border border-zinc-700 rounded-lg overflow-hidden">
                {(['non-branded', 'both', 'branded'] as KwMode[]).map(m => {
                  const isActive = kwMode === m;
                  const activeStyle = m === 'non-branded'
                    ? 'bg-blue-900 text-blue-300'
                    : m === 'branded'
                    ? 'bg-green-900 text-green-400'
                    : 'bg-zinc-600 text-white';
                  return (
                    <button key={m} onClick={() => setKwMode(m)}
                      className={`px-3 py-2 text-xs font-bold transition-colors border-r border-zinc-700 last:border-r-0 whitespace-nowrap ${isActive ? activeStyle : 'text-zinc-400 hover:text-zinc-200'}`}>
                      {m === 'non-branded' ? 'Non-Branded' : m === 'branded' ? 'Branded' : 'Branded + Non-Branded'}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* View Branded Terms button */}
            {kwMode !== 'non-branded' && chartData.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-xs font-bold text-transparent uppercase tracking-wide select-none">Action</span>
                <button onClick={() => setBrandedOpen(true)}
                  className="flex items-center gap-2 px-3 py-2 text-xs font-bold bg-green-900 border border-green-800 text-green-400 rounded-lg hover:bg-green-800 transition-colors whitespace-nowrap">
                  <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                  View Branded Terms
                </button>
              </div>
            )}

            <button onClick={fetchData} disabled={loading}
              className="px-4 py-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white rounded text-sm font-bold self-end">
              {loading ? 'Loading...' : 'Apply'}
            </button>
          </div>
        </div>

        {/* ── GRAPH 1: MARKET SHARE TRENDS ── */}
        <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Market Share Trends
                <span style={{ fontSize: 10, fontWeight: 700, background: badge.bg, color: badge.color, borderRadius: 4, padding: '2px 8px' }}>{badge.label}</span>
              </h2>
              <p className="text-xs text-zinc-200 mt-0.5">
                {mode === 'weekly' ? `${startWeek.shortLabel} → ${endWeek.shortLabel}` : `${startMonth.shortLabel} → ${endMonth.shortLabel}`}
                {' · '}Based on {selAsins.length > 0 ? `${selAsins.length} ASIN(s)` : selFamilies.length > 0 ? `${selFamilies.length} family(s)` : selBrands.length > 0 ? `${selBrands.length} brand(s)` : 'all data'}
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap justify-end">
              {loading && <p className="text-xs text-orange-400 animate-pulse font-semibold">Refreshing...</p>}
              <Toggle value={singleKpi1} onChange={setSingleKpi1} label="Single KPI" />
              {singleKpi1 && (
                <div className="flex gap-1 bg-zinc-700 rounded-lg p-1">
                  {([
                    { key: 'impressionShare', label: 'Impression', color: '#6366f1' },
                    { key: 'clickShare',      label: 'Click',      color: '#06b6d4' },
                    { key: 'cartAddShare',    label: 'Cart Add',   color: '#f97316' },
                    { key: 'purchaseShare',   label: 'Purchase',   color: '#a855f7' },
                    { key: 'revenueShare',    label: 'Revenue',    color: '#4ade80' },
                  ] as const).map(({ key, label, color }) => (
                    <button key={key} onClick={() => setActiveKpi1(key)}
                      className={`px-3 py-1.5 rounded text-sm font-semibold transition-colors ${activeKpi1 === key ? 'bg-zinc-600' : 'text-zinc-400 hover:text-zinc-200'}`}
                      style={activeKpi1 === key ? { color } : {}}>{label}</button>
                  ))}
                </div>
              )}
              <button onClick={() => setModal1Open(true)} className="px-3 py-1.5 text-xs font-semibold text-orange-400 border border-zinc-600 rounded hover:border-orange-400 hover:text-orange-300 transition-colors">Show Data</button>
            </div>
          </div>

          {latest && (
            <div className="grid grid-cols-5 gap-3 mb-6">
              {impPill  && <ShareDonutPill label="Impression Share" color="#6366f1" share={impPill.shareVal}  mktValue={fmtK(impPill.mktVal)}   mktWow={impPill.mktWow}   oursValue={fmtK(impPill.oursVal)}   oursWow={impPill.oursWow}   sharePP={impPill.sharePP}   sharePct={impPill.sharePct}   periodLabel={periodLabel} />}
              {clkPill  && <ShareDonutPill label="Click Share"      color="#06b6d4" share={clkPill.shareVal}  mktValue={fmtK(clkPill.mktVal)}   mktWow={clkPill.mktWow}   oursValue={fmtK(clkPill.oursVal)}   oursWow={clkPill.oursWow}   sharePP={clkPill.sharePP}   sharePct={clkPill.sharePct}   periodLabel={periodLabel} />}
              {cartPill && <ShareDonutPill label="Cart Share"       color="#f97316" share={cartPill.shareVal} mktValue={fmtK(cartPill.mktVal)}  mktWow={cartPill.mktWow}  oursValue={fmtK(cartPill.oursVal)}  oursWow={cartPill.oursWow}  sharePP={cartPill.sharePP}  sharePct={cartPill.sharePct}  periodLabel={periodLabel} />}
              {purPill  && <ShareDonutPill label="Purchase Share"   color="#a855f7" share={purPill.shareVal}  mktValue={fmtK(purPill.mktVal)}   mktWow={purPill.mktWow}   oursValue={fmtK(purPill.oursVal)}   oursWow={purPill.oursWow}   sharePP={purPill.sharePP}   sharePct={purPill.sharePct}   periodLabel={periodLabel} />}
              {latestRevShare && (
                <ShareDonutPill label="Revenue Share" color="#4ade80" share={latestRevShare.share}
                  mktValue={fmtRev(latestRevShare.mktRev)}
                  mktWow={prevRevShare && prevRevShare.mktRev > 0 ? ((latestRevShare.mktRev - prevRevShare.mktRev) / prevRevShare.mktRev) * 100 : null}
                  oursValue={fmtRev(latestRevShare.ourRev)}
                  oursWow={prevRevShare && prevRevShare.ourRev > 0 ? ((latestRevShare.ourRev - prevRevShare.ourRev) / prevRevShare.ourRev) * 100 : null}
                  sharePP={prevRevShare ? latestRevShare.share - prevRevShare.share : null}
                  sharePct={prevRevShare && prevRevShare.share > 0 ? ((latestRevShare.share - prevRevShare.share) / Math.abs(prevRevShare.share)) * 100 : null}
                  periodLabel={periodLabel} />
              )}
            </div>
          )}

          {chartData.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center h-64"><p className="text-zinc-300 text-sm font-semibold">Select a Brand or Family to load data</p></div>
          ) : (
            <ResponsiveContainer width="100%" height={360}>
              <ComposedChart data={formattedChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
                <XAxis dataKey="label" tick={{ fill: '#a1a1aa', fontSize: 11 }} axisLine={{ stroke: '#374151' }} tickLine={false} />
                <YAxis yAxisId="volume" orientation="left" tick={{ fill: '#a1a1aa', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)} />
                <YAxis yAxisId="share"  orientation="right" tick={{ fill: '#a1a1aa', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} domain={[0, 'auto']} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '16px' }} formatter={value => <span style={{ color: '#d4d4d8' }}>{value}</span>} />
                <Bar yAxisId="volume" dataKey="searchVolume" name="Search Volume" fill="#2D4A6B" stroke="#3D6A9B" strokeWidth={1} radius={[2,2,0,0]} />
                {singleKpi1 ? (
                  <Line yAxisId="share" type="monotone" dataKey={activeKpi1}
                    name={activeKpi1 === 'impressionShare' ? 'Impression Share' : activeKpi1 === 'clickShare' ? 'Click Share' : activeKpi1 === 'cartAddShare' ? 'Cart Add Share' : activeKpi1 === 'purchaseShare' ? 'Purchase Share' : 'Revenue Share'}
                    stroke={activeKpi1 === 'impressionShare' ? '#6366f1' : activeKpi1 === 'clickShare' ? '#06b6d4' : activeKpi1 === 'cartAddShare' ? '#f97316' : activeKpi1 === 'purchaseShare' ? '#a855f7' : '#4ade80'}
                    strokeWidth={2} dot={false} />
                ) : (
                  <>
                    <Line yAxisId="share" type="monotone" dataKey="impressionShare" name="Impression Share" stroke="#6366f1" strokeWidth={2} dot={false} />
                    <Line yAxisId="share" type="monotone" dataKey="clickShare"      name="Click Share"      stroke="#06b6d4" strokeWidth={2} dot={false} />
                    <Line yAxisId="share" type="monotone" dataKey="cartAddShare"    name="Cart Add Share"   stroke="#f97316" strokeWidth={2} dot={false} />
                    <Line yAxisId="share" type="monotone" dataKey="purchaseShare"   name="Purchase Share"   stroke="#a855f7" strokeWidth={2} dot={false} />
                    <Line yAxisId="share" type="monotone" dataKey="revenueShare"    name="Revenue Share"    stroke="#4ade80" strokeWidth={2} dot={false} />
                  </>
                )}
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ── GRAPH 1 SHOW DATA MODAL ── */}
        <DataModal open={modal1Open} onClose={() => setModal1Open(false)} title="Market Share Trends">
          <table style={{ borderCollapse: 'collapse', fontSize: 11 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 2, background: '#18181b' }}>
              <tr>
                <th rowSpan={2} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#facc15', borderBottom: HB, background: '#18181b', whiteSpace: 'nowrap' }}>
                  {mode === 'monthly' ? 'Month' : 'Week'}
                </th>
                {G1_KPIS.map(g => (
                  <th key={g.key} colSpan={expandedKpis.has(g.key) ? 3 : 1}
                    style={{ background: '#1e1e22', padding: '6px 10px 3px', textAlign: 'center', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', borderBottom: HB, borderLeft: WB, color: g.color, whiteSpace: 'nowrap' }}>
                    <div>{g.label}</div>
                    <button onClick={() => toggleKpi(g.key)} style={{ marginTop: 4, fontSize: 11, fontWeight: 700, color: '#fff', background: '#3f3f46', border: 'none', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}>
                      {expandedKpis.has(g.key) ? '− collapse' : '+ expand'}
                    </button>
                  </th>
                ))}
                <th colSpan={expandedKpis.has('rev') ? 3 : 1}
                  style={{ background: '#1e1e22', padding: '6px 10px 3px', textAlign: 'center', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', borderBottom: HB, borderLeft: WB, color: '#22c55e', whiteSpace: 'nowrap' }}>
                  <div>Revenue</div>
                  <button onClick={() => toggleKpi('rev')} style={{ marginTop: 4, fontSize: 11, fontWeight: 700, color: '#fff', background: '#3f3f46', border: 'none', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}>
                    {expandedKpis.has('rev') ? '− collapse' : '+ expand'}
                  </button>
                </th>
              </tr>
              <tr style={{ background: '#1a1a1e', borderBottom: HB }}>
                {G1_KPIS.map(g => (
                  <React.Fragment key={g.key}>
                    <th style={{ padding: '5px 10px', textAlign: 'center', fontWeight: 700, color: '#facc15', borderLeft: WB, whiteSpace: 'nowrap' }}>Share</th>
                    {expandedKpis.has(g.key) && <>
                      <th style={{ padding: '5px 8px', textAlign: 'center', fontWeight: 700, color: '#e4e4e7', whiteSpace: 'nowrap' }}>Market</th>
                      <th style={{ padding: '5px 8px', textAlign: 'center', fontWeight: 700, color: '#facc15', whiteSpace: 'nowrap' }}>Ours</th>
                    </>}
                  </React.Fragment>
                ))}
                <th style={{ padding: '5px 10px', textAlign: 'center', fontWeight: 700, color: '#facc15', borderLeft: WB, whiteSpace: 'nowrap' }}>Share</th>
                {expandedKpis.has('rev') && <>
                  <th style={{ padding: '5px 8px', textAlign: 'center', fontWeight: 700, color: '#e4e4e7', whiteSpace: 'nowrap' }}>Mkt Rev</th>
                  <th style={{ padding: '5px 8px', textAlign: 'center', fontWeight: 700, color: '#facc15', whiteSpace: 'nowrap' }}>Our Rev</th>
                </>}
              </tr>
            </thead>
            <tbody>
              {g1ReversedData.map((row, idx, arr) => {
                const prevRow    = arr[idx + 1] ?? null;
                const weekLabel  = mode === 'monthly' ? `${row.periodNumber}/${row.year}` : `W${row.periodNumber}/${row.year}`;
                const ourRev     = row.ourPurchases    * (row.ourPurchasePrice    ?? 0);
                const mktRev     = row.marketPurchases * (row.marketPurchasePrice ?? 0);
                const revShare   = mktRev > 0 ? (ourRev / mktRev) * 100 : 0;
                const prevOurRev = prevRow ? prevRow.ourPurchases    * (prevRow.ourPurchasePrice    ?? 0) : null;
                const prevMktRev = prevRow ? prevRow.marketPurchases * (prevRow.marketPurchasePrice ?? 0) : null;
                const prevRevShare = prevMktRev && prevMktRev > 0 ? (prevOurRev! / prevMktRev) * 100 : null;
                const revPP     = prevRevShare !== null ? revShare - prevRevShare : null;
                const revPPPct  = revPP !== null && prevRevShare && prevRevShare !== 0 ? (revPP / Math.abs(prevRevShare)) * 100 : null;
                const ourRevWow = prevOurRev && prevOurRev > 0 ? ((ourRev - prevOurRev) / prevOurRev) * 100 : null;
                const mktRevWow = prevMktRev && prevMktRev > 0 ? ((mktRev - prevMktRev) / prevMktRev) * 100 : null;
                const revDColor = revPP === null || Math.abs(revPP) < 0.001 ? '#71717a' : revPP > 0 ? '#4ade80' : '#f87171';
                return (
                  <tr key={row.dateKey} style={{ borderBottom: RB }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#27272a')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ padding: '8px 14px', verticalAlign: 'top', borderBottom: RB }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{weekLabel}</div>
                      <div style={{ fontSize: 10, color: '#a1a1aa', marginTop: 1 }}>{row.endDate ? fmtDate(row.endDate) : row.dateKey}</div>
                    </td>
                    {G1_KPIS.map(g => {
                      const shareVal  = row[g.shareKey]  as number;
                      const prevShare = prevRow ? prevRow[g.shareKey] as number : null;
                      const mktVal    = row[g.mktKey]    as number;
                      const prevMkt   = prevRow ? prevRow[g.mktKey]   as number : null;
                      const oursVal   = row[g.oursKey]   as number;
                      const prevOurs  = prevRow ? prevRow[g.oursKey]  as number : null;
                      const pp    = prevShare !== null ? shareVal - prevShare : null;
                      const ppPct = pp !== null && prevShare !== null && prevShare !== 0 ? (pp / Math.abs(prevShare)) * 100 : null;
                      const mktWow  = prevMkt  && prevMkt  > 0 ? ((mktVal  - prevMkt)  / prevMkt)  * 100 : null;
                      const oursWow = prevOurs && prevOurs > 0 ? ((oursVal - prevOurs) / prevOurs) * 100 : null;
                      const dColor  = pp === null || Math.abs(pp) < 0.001 ? '#71717a' : pp > 0 ? '#4ade80' : '#f87171';
                      return (
                        <React.Fragment key={g.key}>
                          <td style={{ padding: '8px 10px', textAlign: 'center', verticalAlign: 'top', borderLeft: WB, borderBottom: RB }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{shareVal.toFixed(1)}%</div>
                            {pp !== null && Math.abs(pp) >= 0.001 && <>
                              <div style={{ fontSize: 10, fontWeight: 700, color: dColor }}>{pp > 0 ? '↑ +' : '↓ '}{Math.abs(pp).toFixed(2)}pp</div>
                              {ppPct !== null && <div style={{ fontSize: 10, fontWeight: 500, color: dColor }}>({ppPct >= 0 ? '+' : ''}{ppPct.toFixed(1)}%)</div>}
                            </>}
                          </td>
                          {expandedKpis.has(g.key) && <td style={{ padding: '8px 10px', textAlign: 'center', verticalAlign: 'top', borderBottom: RB }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#e4e4e7' }}>{fmtK(mktVal)}</div>
                            {mktWow !== null && <div style={{ fontSize: 10, fontWeight: 600, color: dc(mktWow) }}>{ds(mktWow)}{Math.abs(mktWow).toFixed(1)}%</div>}
                          </td>}
                          {expandedKpis.has(g.key) && <td style={{ padding: '8px 10px', textAlign: 'center', verticalAlign: 'top', borderBottom: RB }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#facc15' }}>{fmtK(oursVal)}</div>
                            {oursWow !== null && <div style={{ fontSize: 10, fontWeight: 600, color: dc(oursWow) }}>{ds(oursWow)}{Math.abs(oursWow).toFixed(1)}%</div>}
                          </td>}
                        </React.Fragment>
                      );
                    })}
                    <td style={{ padding: '8px 10px', textAlign: 'center', verticalAlign: 'top', borderLeft: WB, borderBottom: RB }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{revShare.toFixed(1)}%</div>
                      {revPP !== null && Math.abs(revPP) >= 0.001 && <>
                        <div style={{ fontSize: 10, fontWeight: 700, color: revDColor }}>{revPP > 0 ? '↑ +' : '↓ '}{Math.abs(revPP).toFixed(2)}pp</div>
                        {revPPPct !== null && <div style={{ fontSize: 10, fontWeight: 500, color: revDColor }}>({revPPPct >= 0 ? '+' : ''}{revPPPct.toFixed(1)}%)</div>}
                      </>}
                    </td>
                    {expandedKpis.has('rev') && <td style={{ padding: '8px 10px', textAlign: 'center', verticalAlign: 'top', borderBottom: RB }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#e4e4e7' }}>{fmtRev(mktRev)}</div>
                      {mktRevWow !== null && <div style={{ fontSize: 10, fontWeight: 600, color: dc(mktRevWow) }}>{ds(mktRevWow)}{Math.abs(mktRevWow).toFixed(1)}%</div>}
                    </td>}
                    {expandedKpis.has('rev') && <td style={{ padding: '8px 10px', textAlign: 'center', verticalAlign: 'top', borderBottom: RB }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#facc15' }}>{fmtRev(ourRev)}</div>
                      {ourRevWow !== null && <div style={{ fontSize: 10, fontWeight: 600, color: dc(ourRevWow) }}>{ds(ourRevWow)}{Math.abs(ourRevWow).toFixed(1)}%</div>}
                    </td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </DataModal>

        <FunnelRatesChart chartData={chartData} mode={mode} hasFilter={hasFilter} />
        <MedianPriceChart chartData={chartData} mode={mode} hasFilter={hasFilter} />
      </div>

      {/* ── BRANDED TERMS MODAL ── */}
      <DataModal open={brandedOpen} onClose={() => setBrandedOpen(false)} title="Branded Search Terms">
        {/* Filter bar inside modal */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.10)', background: '#1c1c1e', display: 'flex', alignItems: 'flex-end', gap: 14, flexShrink: 0, flexWrap: 'wrap' }}>
          {/* Multi-select period picker */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {mode === 'monthly' ? 'Months' : 'Weeks'}
            </span>
            <div ref={brandedDDRef} style={{ position: 'relative' }}>
              <button onClick={() => setBrandedDDOpen(o => !o)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#27272a', border: '1px solid #3f3f46', borderRadius: 7, color: '#e4e4e7', fontSize: 12, fontWeight: 600, padding: '7px 12px', cursor: 'pointer', minWidth: 260 }}>
                <span style={{ flex: 1, textAlign: 'left' }}>
                  {selBrandedPeriods.length === 0 ? 'Select periods...'
                    : selBrandedPeriods.length === 1 ? (brandedPeriodOptions.find(o => o.value === selBrandedPeriods[0])?.label ?? selBrandedPeriods[0])
                    : `${selBrandedPeriods.length} periods selected`}
                </span>
                <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ flexShrink: 0 }}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"/></svg>
              </button>
              {brandedDDOpen && (
                <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, background: '#27272a', border: '1px solid #3f3f46', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', zIndex: 200, minWidth: 280, maxHeight: 280, overflowY: 'auto', padding: 6 }}>
                  {brandedPeriodOptions.length === 0
                    ? <p style={{ fontSize: 12, color: '#71717a', padding: '8px 10px' }}>No branded terms found</p>
                    : brandedPeriodOptions.map(opt => {
                        const isSel = selBrandedPeriods.includes(opt.value);
                        return (
                          <div key={opt.value}
                            onClick={() => setSelBrandedPeriods(prev => isSel ? prev.filter(v => v !== opt.value) : [...prev, opt.value])}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: isSel ? '#4ade80' : '#d4d4d8', background: isSel ? 'rgba(74,222,128,0.08)' : 'transparent' }}>
                            <div style={{ width: 14, height: 14, borderRadius: 4, border: `1px solid ${isSel ? '#4ade80' : '#52525b'}`, background: isSel ? '#4ade80' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 9, color: '#000', fontWeight: 900 }}>
                              {isSel ? '✓' : ''}
                            </div>
                            {opt.label}
                          </div>
                        );
                      })
                  }
                </div>
              )}
            </div>
          </div>

          <div style={{ fontSize: 11, color: '#71717a', paddingBottom: 3 }}>
            {filteredBrandedRows.length} rows · {selBrandedPeriods.length} period{selBrandedPeriods.length !== 1 ? 's' : ''} selected · sorted by search volume ↓
          </div>

          {loadingBranded && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 3 }}>
              <div style={{ width: 14, height: 14, border: '2px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              <span style={{ fontSize: 11, color: '#a1a1aa' }}>Loading...</span>
            </div>
          )}
        </div>

        {/* Table */}
        {loadingBranded ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', gap: 10 }}>
            <div style={{ width: 18, height: 18, border: '2px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            <span style={{ fontSize: 13, color: '#a1a1aa' }}>Loading branded terms...</span>
          </div>
        ) : filteredBrandedRows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#71717a', fontSize: 13 }}>
            {selBrandedPeriods.length === 0 ? 'Select one or more periods above to view branded terms.' : 'No branded terms found for the selected periods.'}
          </div>
        ) : (
          <table style={{ borderCollapse: 'collapse', fontSize: 11 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 2, background: '#18181b' }}>
              <tr>
                {/* Search Term */}
                <th rowSpan={2} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#facc15', borderBottom: HB, background: '#18181b', whiteSpace: 'nowrap' }}>
                  Search Term
                </th>
                {/* Search Volume */}
                <th rowSpan={2} style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: '#facc15', borderBottom: HB, borderLeft: WB, background: '#1e1e22', whiteSpace: 'nowrap' }}>
                  Search Vol
                </th>
                {/* KPI segments */}
                {BR_KPIS.map(g => (
                  <th key={g.key} colSpan={expandedBrKpis.has(g.key) ? 3 : 1}
                    style={{ background: '#1e1e22', padding: '6px 10px 3px', textAlign: 'center', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', borderBottom: HB, borderLeft: WB, color: g.color, whiteSpace: 'nowrap' }}>
                    <div>{g.label}</div>
                    <button onClick={() => toggleBrKpi(g.key)} style={{ marginTop: 4, fontSize: 10, fontWeight: 700, color: '#fff', background: '#3f3f46', border: 'none', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', display: 'block', width: '100%' }}>
                      {expandedBrKpis.has(g.key) ? '− collapse' : '+ expand'}
                    </button>
                  </th>
                ))}
              </tr>
              <tr style={{ background: '#1a1a1e', borderBottom: HB }}>
                {BR_KPIS.map(g => (
                  <React.Fragment key={g.key}>
                    <th style={{ padding: '5px 10px', textAlign: 'center', fontWeight: 700, color: '#facc15', borderLeft: WB, whiteSpace: 'nowrap' }}>Share</th>
                    {expandedBrKpis.has(g.key) && <>
                      <th style={{ padding: '5px 8px', textAlign: 'center', fontWeight: 700, color: '#e4e4e7', borderLeft: '1px solid rgba(255,255,255,0.10)', whiteSpace: 'nowrap' }}>Market</th>
                      <th style={{ padding: '5px 8px', textAlign: 'center', fontWeight: 700, color: '#facc15', borderLeft: '1px solid rgba(255,255,255,0.10)', whiteSpace: 'nowrap' }}>Ours</th>
                    </>}
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredBrandedRows.map((row, idx) => {
                const priorRow  = getBrandedPriorRow(row);
                const periodLbl = mode === 'monthly' ? `${row.weekNumber}/${row.year}` : `W${row.weekNumber}/${row.year}`;
                const svWow     = priorRow ? wowPct(row.searchVolume, priorRow.searchVolume) : null;
                return (
                  <tr key={`${row.weekKey}-${row.searchTerm}`} style={{ borderBottom: RB }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#27272a')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    {/* Search Term cell */}
                    <td title={row.searchTerm} style={{ padding: '8px 14px', verticalAlign: 'top', borderBottom: RB, maxWidth: 200, minWidth: 160 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 176 }}>{row.searchTerm}</div>
                      <div style={{ fontSize: 10, color: '#71717a', marginTop: 1 }}>{periodLbl}{row.weekEnd ? ` · ${fmtDate(row.weekEnd)}` : ''}</div>
                      <div style={{ display: 'inline-block', fontSize: 9, fontWeight: 700, background: '#14532d', color: '#4ade80', borderRadius: 3, padding: '1px 5px', marginTop: 3 }}>branded</div>
                    </td>
                    {/* Search Volume */}
                    <td style={{ padding: '8px 10px', textAlign: 'center', verticalAlign: 'top', borderLeft: WB, borderBottom: RB }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#e4e4e7' }}>{fmtK(row.searchVolume)}</div>
                      {svWow ? <div style={{ fontSize: 10, fontWeight: 600, color: svWow.pos ? '#4ade80' : '#f87171' }}>{svWow.pos ? '↑' : '↓'} {svWow.val}</div> : <div style={{ fontSize: 10, color: '#52525b' }}>—</div>}
                    </td>
                    {/* KPI cells */}
                    {BR_KPIS.map(g => {
                      const mktVal   = row[g.mktKey]  as number;
                      const oursVal  = row[g.oursKey] as number;
                      const share    = mktVal > 0 ? (oursVal / mktVal) * 100 : 0;
                      const prevMkt  = priorRow ? priorRow[g.mktKey]  as number : undefined;
                      const prevOurs = priorRow ? priorRow[g.oursKey] as number : undefined;
                      const prevShare = prevMkt && prevMkt > 0 && prevOurs !== undefined ? (prevOurs / prevMkt) * 100 : undefined;
                      return (
                        <React.Fragment key={g.key}>
                          {brShareCell(share, prevShare)}
                          {expandedBrKpis.has(g.key) && brValCell(mktVal,  prevMkt,  '#e4e4e7', g.isCcy)}
                          {expandedBrKpis.has(g.key) && brValCell(oursVal, prevOurs, '#facc15', g.isCcy)}
                        </React.Fragment>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </DataModal>
    </div>
  );
}