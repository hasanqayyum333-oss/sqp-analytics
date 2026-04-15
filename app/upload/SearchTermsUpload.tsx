'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

// --- Dynamic Amazon week generator ---
function getAmazonWeekNumber(saturdayDate: Date): { week: number; year: number } {
  const year = saturdayDate.getUTCFullYear();
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const jan1Day = jan1.getUTCDay();
  const daysToFirstSat = jan1Day === 6 ? 0 : (6 - jan1Day);
  const firstSat = new Date(Date.UTC(year, 0, 1 + daysToFirstSat));
  if (saturdayDate < firstSat) {
    return getAmazonWeekNumber(new Date(saturdayDate.getTime() - 7 * 86400000));
  }
  const weekNumber = Math.round((saturdayDate.getTime() - firstSat.getTime()) / (7 * 86400000)) + 1;
  return { week: weekNumber, year };
}

function toISO(date: Date): string {
  return date.toISOString().split('T')[0];
}

function generateWeeks(): { label: string; weekNumber: number; start: string; end: string }[] {
  const weeks: { label: string; weekNumber: number; start: string; end: string }[] = [];
  const today = new Date();
  const todayUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const dayOfWeek = todayUTC.getUTCDay();
  const daysToLastSat = dayOfWeek === 6 ? 0 : dayOfWeek + 1;
  const latestSat = new Date(todayUTC.getTime() - daysToLastSat * 86400000);
  const earliestSat = new Date(Date.UTC(2025, 0, 4));

  let current = new Date(latestSat);
  while (current >= earliestSat) {
    const sunday = new Date(current.getTime() - 6 * 86400000);
    const { week, year } = getAmazonWeekNumber(current);
    weeks.push({
      label: `Week ${week}/${year} — ${sunday.toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
      })} to ${current.toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
      })}`,
      weekNumber: week,
      start: toISO(sunday),
      end: toISO(current),
    });
    current = new Date(current.getTime() - 7 * 86400000);
  }
  return weeks;
}

const WEEKS = generateWeeks();

type Week = typeof WEEKS[number];

// --- Custom Week Dropdown ---
function WeekDropdown({
  value,
  onChange,
}: {
  value: Week;
  onChange: (w: Week) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} className="relative w-full max-w-lg">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between bg-gray-800 border border-gray-700 text-white rounded px-3 py-2 text-sm hover:border-gray-500 transition-colors"
      >
        <span>{value.label}</span>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown list */}
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-700 rounded shadow-xl overflow-hidden">
          <div className="overflow-y-auto max-h-64">
            {WEEKS.map(w => (
              <div
                key={w.start}
                onClick={() => { onChange(w); setOpen(false); }}
                className={`px-3 py-2 text-sm cursor-pointer transition-colors ${
                  w.start === value.start
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-200 hover:bg-gray-700'
                }`}
              >
                {w.label}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Types ---
type UploadStatus = {
  stage: 'idle' | 'parsing' | 'uploading' | 'done' | 'error';
  message?: string;
  inserted?: number;
  skipped?: number;
  errors?: string[];
};

type ParsedResult = {
  rows: Record<string, unknown>[];
  count: number;
  adType: string;
  periodType: string;
  periodStart: string;
  periodEnd: string;
  weekNumber: string;
};

export default function SearchTermsUpload() {
  const [periodType, setPeriodType] = useState<'weekly' | 'monthly' | 'quarterly'>('weekly');
  const [selectedWeek, setSelectedWeek] = useState<Week>(WEEKS[0]);
  const [adType, setAdType] = useState<'SP' | 'SB'>('SP');
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [parsed, setParsed] = useState<ParsedResult | null>(null);
  const [status, setStatus] = useState<UploadStatus>({ stage: 'idle' });

  const reset = () => {
    setFile(null);
    setParsed(null);
    setStatus({ stage: 'idle' });
  };

  const handleFile = useCallback((f: File) => {
    setFile(f);
    setParsed(null);
    setStatus({ stage: 'idle' });
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const handleParse = async () => {
    if (!file) return;
    setStatus({ stage: 'parsing', message: 'Reading and validating file...' });

    const formData = new FormData();
    formData.append('file', file);
    formData.append('adType', adType);
    formData.append('periodType', periodType);
    formData.append('periodStart', selectedWeek.start);
    formData.append('periodEnd', selectedWeek.end);
    formData.append('weekNumber', String(selectedWeek.weekNumber));

    const res = await fetch('/api/parse-search-terms', { method: 'POST', body: formData });
    const data = await res.json();

    if (!res.ok) { setStatus({ stage: 'error', message: data.error }); return; }
    setParsed(data);
    setStatus({ stage: 'idle' });
  };

  const handleUpload = async () => {
    if (!parsed) return;

    const CHUNK = 500;
    const total = parsed.rows.length;
    const chunks: Record<string, unknown>[][] = [];
    for (let i = 0; i < total; i += CHUNK) chunks.push(parsed.rows.slice(i, i + CHUNK));

    let totalInserted = 0;
    let totalSkipped  = 0;
    const allErrors: string[] = [];

    for (let idx = 0; idx < chunks.length; idx++) {
      setStatus({
        stage: 'uploading',
        message: `Uploading batch ${idx + 1} of ${chunks.length} (${Math.round(((idx) / chunks.length) * 100)}%)...`,
      });

      let lastErr: string | null = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const res = await fetch('/api/upload-search-terms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rows: chunks[idx], periodType }),
          });
          const data = await res.json();
          if (!res.ok) { lastErr = data.error ?? `HTTP ${res.status}`; }
          else {
            totalInserted += data.inserted ?? 0;
            totalSkipped  += data.skipped  ?? 0;
            if (data.errors?.length) allErrors.push(...data.errors);
            lastErr = null;
            break;
          }
        } catch (e) {
          lastErr = String(e);
        }
        if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 1000));
      }

      if (lastErr) {
        allErrors.push(`Batch ${idx + 1}: ${lastErr}`);
        totalSkipped += chunks[idx].length;
      }
    }

    setStatus({ stage: 'done', inserted: totalInserted, skipped: totalSkipped, errors: allErrors });
  };

  return (
    <div className="space-y-6">

      <div>
        <h2 className="text-lg font-semibold mb-1">Ad Search Terms</h2>
        <p className="text-sm text-gray-400">
          Upload your Sponsored Products or Sponsored Brands Search Term reports.
          Brand, family, week number, and dates are assigned automatically from your selection below.
        </p>
      </div>

      {/* Period Type */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-2">REPORT PERIOD TYPE</label>
        <div className="flex gap-2">
          {(['weekly', 'monthly', 'quarterly'] as const).map(p => (
            <button key={p} onClick={() => { setPeriodType(p); reset(); }}
              className={`px-4 py-1.5 rounded text-sm capitalize ${periodType === p ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Week Selector */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-2">SELECT WEEK *</label>
        <WeekDropdown
          value={selectedWeek}
          onChange={w => { setSelectedWeek(w); reset(); }}
        />
        <p className="text-blue-400 text-xs mt-1">
          ✓ Week {selectedWeek.weekNumber} · {selectedWeek.start} → {selectedWeek.end}
        </p>
      </div>

      {/* Ad Type */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-2">AD TYPE *</label>
        <div className="flex gap-2">
          {(['SP', 'SB'] as const).map(t => (
            <button key={t} onClick={() => { setAdType(t); reset(); }}
              className={`px-4 py-1.5 rounded text-sm ${adType === t ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}>
              {t === 'SP' ? 'Sponsored Products' : 'Sponsored Brands'}
            </button>
          ))}
        </div>
      </div>

      {/* Info box */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 text-xs text-gray-400 space-y-1">
        <p className="text-gray-300 font-medium mb-1">The following will be assigned from your selection above:</p>
        <p>• <span className="text-white">Week Number:</span> {selectedWeek.weekNumber}</p>
        <p>• <span className="text-white">Start Date:</span> {selectedWeek.start}</p>
        <p>• <span className="text-white">End Date:</span> {selectedWeek.end}</p>
        <p>• <span className="text-white">Ad Type:</span> {adType}</p>
        <p className="text-gray-500 pt-1">Dates in the file itself are ignored.</p>
      </div>

      {/* Upload stages */}
      {status.stage === 'done' ? (
        <div className="border border-green-600 rounded-lg p-6 bg-gray-900">
          <p className="text-green-400 font-semibold text-lg mb-4">✅ Upload complete</p>
          <div className="flex gap-8 text-sm mb-3">
            <div>
              <p className="text-xs text-gray-400 mb-1">Inserted</p>
              <p className="text-green-400 text-2xl font-bold">{status.inserted?.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Skipped</p>
              <p className="text-yellow-400 text-2xl font-bold">{status.skipped?.toLocaleString()}</p>
            </div>
          </div>
          {status.errors && status.errors.length > 0 && (
            <div className="mt-2 space-y-1">
              {status.errors.map((e, i) => <p key={i} className="text-red-400 text-xs">⚠ {e}</p>)}
            </div>
          )}
          <button onClick={reset} className="mt-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm">
            Upload another file
          </button>
        </div>

      ) : !file ? (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${dragOver ? 'border-blue-500 bg-blue-500/5' : 'border-gray-700 hover:border-gray-600'}`}
        >
          <div className="text-4xl mb-3">📄</div>
          <p className="text-sm font-medium text-gray-300">
            Drop your {adType === 'SP' ? 'Sponsored Products' : 'Sponsored Brands'} Search Term file here
          </p>
          <p className="text-xs text-gray-500 mt-1 mb-4">Excel (.xlsx) format</p>
          <label className="cursor-pointer bg-gray-800 hover:bg-gray-700 text-white text-sm px-4 py-2 rounded-lg transition-colors">
            Choose File
            <input type="file" accept=".xlsx,.xls" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </label>
        </div>

      ) : !parsed ? (
        <div className="border border-gray-700 rounded-lg p-6 bg-gray-900 space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📄</span>
            <div>
              <p className="text-white text-sm font-medium">{file.name}</p>
              <p className="text-gray-400 text-xs">
                {adType} · {periodType} · Week {selectedWeek.weekNumber} · {selectedWeek.start} → {selectedWeek.end}
              </p>
            </div>
          </div>
          {status.stage === 'error' && (
            <div className="p-3 bg-red-900/40 border border-red-600 rounded text-red-400 text-sm">⚠ {status.message}</div>
          )}
          <div className="flex gap-3">
            <button onClick={handleParse} disabled={status.stage === 'parsing'}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded text-sm font-medium">
              {status.stage === 'parsing' ? 'Validating...' : 'Validate File'}
            </button>
            <button onClick={reset} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm">Cancel</button>
          </div>
        </div>

      ) : (
        <div className="border border-gray-700 rounded-lg p-6 bg-gray-900 space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-green-400 text-xl">✓</span>
            <div>
              <p className="text-green-400 text-sm font-medium">File validated — {parsed.count.toLocaleString()} rows ready</p>
              <p className="text-gray-400 text-xs">
                {parsed.adType} · {parsed.periodType} · Week {parsed.weekNumber} · {parsed.periodStart} → {parsed.periodEnd}
              </p>
            </div>
          </div>
          {status.stage === 'error' && (
            <div className="p-3 bg-red-900/40 border border-red-600 rounded text-red-400 text-sm">⚠ {status.message}</div>
          )}
          <div className="flex gap-3">
            <button onClick={handleUpload} disabled={status.stage === 'uploading'}
              className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white rounded text-sm font-medium">
              {status.stage === 'uploading' ? status.message : `Upload ${parsed.count.toLocaleString()} rows`}
            </button>
            <button onClick={reset} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}