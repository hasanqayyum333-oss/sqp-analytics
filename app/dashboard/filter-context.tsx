'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// ─── Week / Month generators (duplicated from trends-page so context is self-contained) ───
function getAmazonWeekNumber(sat: Date): { week: number; year: number } {
  const year = sat.getUTCFullYear();
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const daysToFirstSat = jan1.getUTCDay() === 6 ? 0 : 6 - jan1.getUTCDay();
  const firstSat = new Date(Date.UTC(year, 0, 1 + daysToFirstSat));
  if (sat < firstSat) return getAmazonWeekNumber(new Date(sat.getTime() - 7 * 86400000));
  const week = Math.round((sat.getTime() - firstSat.getTime()) / (7 * 86400000)) + 1;
  return { week, year };
}
function toISO(d: Date) { return d.toISOString().split('T')[0]; }
export function generateWeeks() {
  const weeks: WeekOption[] = [];
  const today = new Date();
  const todayUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const dow = todayUTC.getUTCDay();
  const latestSat = new Date(todayUTC.getTime() - (dow === 6 ? 0 : dow + 1) * 86400000);
  const earliestSat = new Date(Date.UTC(2025, 0, 4));
  let cur = new Date(latestSat);
  while (cur >= earliestSat) {
    const sun = new Date(cur.getTime() - 6 * 86400000);
    const { week, year } = getAmazonWeekNumber(cur);
    const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' });
    weeks.push({ label: `Week ${week}/${year} — ${fmt(sun)} to ${fmt(cur)}`, shortLabel: `W${week}/${year}`, weekNumber: week, year, start: toISO(sun), end: toISO(cur) });
    cur = new Date(cur.getTime() - 7 * 86400000);
  }
  return weeks;
}
export function generateMonths() {
  const months: MonthOption[] = [];
  const today = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const year = d.getFullYear(); const month = d.getMonth() + 1;
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    months.push({ label: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }), shortLabel: `${String(month).padStart(2, '0')}/${year}`, monthNumber: month, year, start, end });
  }
  return months;
}

export type WeekOption = { label: string; shortLabel: string; weekNumber: number; year: number; start: string; end: string };
export type MonthOption = { label: string; shortLabel: string; monthNumber: number; year: number; start: string; end: string };

const ALL_WEEKS  = generateWeeks();
const ALL_MONTHS = generateMonths();

const DEFAULT_START_WEEK  = ALL_WEEKS[Math.min(29, ALL_WEEKS.length - 1)];
const DEFAULT_END_WEEK    = ALL_WEEKS[0];
const DEFAULT_START_MONTH = ALL_MONTHS[Math.min(5, ALL_MONTHS.length - 1)];
const DEFAULT_END_MONTH   = ALL_MONTHS[0];

// ─── Types ────────────────────────────────────────────────────────────────────
export type FilterState = {
  mode:        'weekly' | 'monthly';
  selBrands:   string[];
  selFamilies: string[];
  selAsins:    string[];
  startWeek:   WeekOption;
  endWeek:     WeekOption;
  startMonth:  MonthOption;
  endMonth:    MonthOption;
};

type FilterContextType = FilterState & {
  setMode:        (v: 'weekly' | 'monthly') => void;
  setSelBrands:   (v: string[]) => void;
  setSelFamilies: (v: string[]) => void;
  setSelAsins:    (v: string[]) => void;
  setStartWeek:   (v: WeekOption) => void;
  setEndWeek:     (v: WeekOption) => void;
  setStartMonth:  (v: MonthOption) => void;
  setEndMonth:    (v: MonthOption) => void;
  allWeeks:       WeekOption[];
  allMonths:      MonthOption[];
};

const FilterContext = createContext<FilterContextType | null>(null);

// ─── Helpers to serialise/deserialise from sessionStorage ────────────────────
const SESSION_KEY = 'sqp_dashboard_filters';

function loadFromSession(): Partial<FilterState> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<FilterState>;
  } catch { return {}; }
}

function saveToSession(state: FilterState) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(state)); } catch {}
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function FilterProvider({ children }: { children: ReactNode }) {
  const saved = loadFromSession();

  // Resolve saved week/month objects against the live-generated lists
  // (labels may be stale if weeks regenerated) — match by start date string
  const resolveWeek = (s?: WeekOption) =>
    s ? (ALL_WEEKS.find(w => w.start === s.start) ?? DEFAULT_START_WEEK) : DEFAULT_START_WEEK;
  const resolveEndWeek = (s?: WeekOption) =>
    s ? (ALL_WEEKS.find(w => w.start === s.start) ?? DEFAULT_END_WEEK) : DEFAULT_END_WEEK;
  const resolveMonth = (s?: MonthOption) =>
    s ? (ALL_MONTHS.find(m => m.start === s.start) ?? DEFAULT_START_MONTH) : DEFAULT_START_MONTH;
  const resolveEndMonth = (s?: MonthOption) =>
    s ? (ALL_MONTHS.find(m => m.start === s.start) ?? DEFAULT_END_MONTH) : DEFAULT_END_MONTH;

  const [mode,        setModeRaw]        = useState<'weekly' | 'monthly'>(saved.mode ?? 'weekly');
  const [selBrands,   setSelBrandsRaw]   = useState<string[]>(saved.selBrands ?? []);
  const [selFamilies, setSelFamiliesRaw] = useState<string[]>(saved.selFamilies ?? []);
  const [selAsins,    setSelAsinsRaw]    = useState<string[]>(saved.selAsins ?? []);
  const [startWeek,   setStartWeekRaw]   = useState<WeekOption>(resolveWeek(saved.startWeek));
  const [endWeek,     setEndWeekRaw]     = useState<WeekOption>(resolveEndWeek(saved.endWeek));
  const [startMonth,  setStartMonthRaw]  = useState<MonthOption>(resolveMonth(saved.startMonth));
  const [endMonth,    setEndMonthRaw]    = useState<MonthOption>(resolveEndMonth(saved.endMonth));

  // Any time state changes, persist to sessionStorage
  useEffect(() => {
    saveToSession({ mode, selBrands, selFamilies, selAsins, startWeek, endWeek, startMonth, endMonth });
  }, [mode, selBrands, selFamilies, selAsins, startWeek, endWeek, startMonth, endMonth]);

  // Wrapped setters — plain passthrough (no auto-reset on mode change)
  const setMode        = (v: 'weekly' | 'monthly') => setModeRaw(v);
  const setSelBrands   = (v: string[]) => setSelBrandsRaw(v);
  const setSelFamilies = (v: string[]) => setSelFamiliesRaw(v);
  const setSelAsins    = (v: string[]) => setSelAsinsRaw(v);
  const setStartWeek   = (v: WeekOption)  => setStartWeekRaw(v);
  const setEndWeek     = (v: WeekOption)  => setEndWeekRaw(v);
  const setStartMonth  = (v: MonthOption) => setStartMonthRaw(v);
  const setEndMonth    = (v: MonthOption) => setEndMonthRaw(v);

  return (
    <FilterContext.Provider value={{
      mode, selBrands, selFamilies, selAsins,
      startWeek, endWeek, startMonth, endMonth,
      setMode, setSelBrands, setSelFamilies, setSelAsins,
      setStartWeek, setEndWeek, setStartMonth, setEndMonth,
      allWeeks: ALL_WEEKS, allMonths: ALL_MONTHS,
    }}>
      {children}
    </FilterContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useFilters(): FilterContextType {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error('useFilters must be used inside FilterProvider');
  return ctx;
}