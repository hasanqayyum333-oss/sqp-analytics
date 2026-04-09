'use client'

import { useState, useCallback } from 'react'

// ─── TYPES ───────────────────────────────────────────────────────────────────

interface UploadResult {
  inserted: number
  skipped: number
  total: number
  unmapped: number
  errors?: string[]
}

interface ParsedRow {
  child_asin: string
  brand_name: string | null
  family_name: string | null
  week_start_date: string
  week_end_date: string
  week_number: number
  year: number
  search_term: string
  search_query_score: number | null
  search_volume: number | null
  impressions_total: number | null
  impressions_asin: number | null
  impressions_share_pct: number | null
  clicks_total: number | null
  clicks_rate_pct: number | null
  clicks_asin: number | null
  clicks_share_pct: number | null
  clicks_price_median: number | null
  clicks_asin_price_median: number | null
  clicks_same_day_ship: number | null
  clicks_1d_ship: number | null
  clicks_2d_ship: number | null
  cart_adds_total: number | null
  cart_adds_rate_pct: number | null
  cart_adds_asin: number | null
  cart_adds_share_pct: number | null
  cart_adds_price_median: number | null
  cart_adds_asin_price_median: number | null
  cart_adds_same_day_ship: number | null
  cart_adds_1d_ship: number | null
  cart_adds_2d_ship: number | null
  purchases_total: number | null
  purchases_rate_pct: number | null
  purchases_asin: number | null
  purchases_share_pct: number | null
  purchases_price_median: number | null
  purchases_asin_price_median: number | null
  purchases_same_day_ship: number | null
  purchases_1d_ship: number | null
  purchases_2d_ship: number | null
  marketplace: string | null
  is_branded: boolean
  brand_keyword_matched: string | null
}

interface ParseResult {
  rows: ParsedRow[]
  unmappedAsins: string[]
  errors: string[]
}

interface DupResult {
  databaseCount: number
  databaseDuplicates: Record<string, unknown>[]
  totalChecked: number
  newRows: number
}

// ─── COLUMN MAP ──────────────────────────────────────────────────────────────

const COL_MAP: Record<string, string> = {
  'asin':                               'child_asin',
  'search query':                       'search_term',
  'search query score':                 'search_query_score',
  'search query volume':                'search_volume',
  'impressions: total count':           'impressions_total',
  'impressions: asin count':            'impressions_asin',
  'impressions: asin share %':          'impressions_share_pct',
  'clicks: total count':                'clicks_total',
  'clicks: click rate %':               'clicks_rate_pct',
  'clicks: asin count':                 'clicks_asin',
  'clicks: asin share %':               'clicks_share_pct',
  'clicks: price (median)':             'clicks_price_median',
  'clicks: asin price (median)':        'clicks_asin_price_median',
  'clicks: same day shipping speed':    'clicks_same_day_ship',
  'clicks: 1d shipping speed':          'clicks_1d_ship',
  'clicks: 2d shipping speed':          'clicks_2d_ship',
  'cart adds: total count':             'cart_adds_total',
  'cart adds: cart add rate %':         'cart_adds_rate_pct',
  'cart adds: asin count':              'cart_adds_asin',
  'cart adds: asin share %':            'cart_adds_share_pct',
  'cart adds: price (median)':          'cart_adds_price_median',
  'cart adds: asin price (median)':     'cart_adds_asin_price_median',
  'cart adds: same day shipping speed': 'cart_adds_same_day_ship',
  'cart adds: 1d shipping speed':       'cart_adds_1d_ship',
  'cart adds: 2d shipping speed':       'cart_adds_2d_ship',
  'purchases: total count':             'purchases_total',
  'purchases: purchase rate %':         'purchases_rate_pct',
  'purchases: asin count':              'purchases_asin',
  'purchases: asin share %':            'purchases_share_pct',
  'purchases: price (median)':          'purchases_price_median',
  'purchases: asin price (median)':     'purchases_asin_price_median',
  'purchases: same day shipping speed': 'purchases_same_day_ship',
  'purchases: 1d shipping speed':       'purchases_1d_ship',
  'purchases: 2d shipping speed':       'purchases_2d_ship',
  'marketplace':                        'marketplace',
  'reporting date':                     'reporting_date',
}

// ─── DELIMITER & PARSING UTILS ───────────────────────────────────────────────

function detectDelimiter(firstLine: string): string {
  const tabs = (firstLine.match(/\t/g) || []).length
  const commas = (firstLine.match(/,/g) || []).length
  return tabs > commas ? '\t' : ','
}

function splitLine(line: string, delimiter: string): string[] {
  if (delimiter === '\t') {
    return line.split('\t').map(v => v.trim().replace(/^["']|["']$/g, ''))
  }
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { inQuotes = !inQuotes }
    else if (ch === ',' && !inQuotes) { result.push(current); current = '' }
    else { current += ch }
  }
  result.push(current)
  return result.map(v => v.trim().replace(/^["']|["']$/g, ''))
}

function toNum(val: string | undefined): number | null {
  if (!val || val.trim() === '' || val.trim() === '--' || val.trim() === 'N/A') return null
  const n = parseFloat(val.trim().replace(/,/g, ''))
  return isNaN(n) ? null : n
}

// ─── DATE UTILS ──────────────────────────────────────────────────────────────

function toDateStr(date: Date): string {
  return date.toISOString().split('T')[0]
}

function getAmazonWeekNumber(weekEndDate: Date): number {
  const year = weekEndDate.getUTCFullYear()
  const jan1 = new Date(Date.UTC(year, 0, 1))
  const jan1Day = jan1.getUTCDay()
  const daysToFirstSat = jan1Day === 6 ? 0 : (6 - jan1Day)
  const firstWeekEnd = new Date(Date.UTC(year, 0, 1 + daysToFirstSat))
  return Math.round((weekEndDate.getTime() - firstWeekEnd.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1
}

// Parses date strings including:
//   "February 2026" last day of Feb 2026 (monthly full name format)
//   "Feb-26"        last day of Feb 2026 (monthly short format)
//   "2025-01-31"    standard ISO
//   "31/01/2025"    DD/MM/YYYY
//   "01/31/2025"    MM/DD/YYYY
function parseReportingDate(dateStr: string): Date {
  const s = dateStr.trim()

  // Handle full month name format e.g. "February 2026", "January 2025"
  const fullMonthMatch = s.match(/^([A-Za-z]+)\s+(\d{4})$/)
  if (fullMonthMatch) {
    const fullMonthNames: Record<string, number> = {
      january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
      july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
    }
    const month = fullMonthNames[fullMonthMatch[1].toLowerCase()]
    if (month === undefined) throw new Error('Unrecognised month name: ' + s)
    const year = parseInt(fullMonthMatch[2])
    return new Date(Date.UTC(year, month + 1, 0))
  }

  // Handle MMM-YY format e.g. "Feb-26", "Jan-25", "Dec-24"
  const monthYearMatch = s.match(/^([A-Za-z]{3})-(\d{2})$/)
  if (monthYearMatch) {
    const monthNames: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    }
    const month = monthNames[monthYearMatch[1].toLowerCase()]
    if (month === undefined) throw new Error(`Unrecognised month abbreviation: ${s}`)
    const year = 2000 + parseInt(monthYearMatch[2])
    // Return last day of that month
    const lastDay = new Date(Date.UTC(year, month + 1, 0))
    return lastDay
  }

  // Standard 3-part date formats
  const parts = s.split(/[-\/]/)
  if (parts.length !== 3) throw new Error(`Unrecognised date format: ${s}`)
  if (parts[0].length === 4) return new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2]))
  if (+parts[0] > 12) return new Date(Date.UTC(+parts[2], +parts[1] - 1, +parts[0]))
  if (+parts[1] > 12) return new Date(Date.UTC(+parts[2], +parts[0] - 1, +parts[1]))
  return new Date(Date.UTC(+parts[2], +parts[1] - 1, +parts[0]))
}

// Derives week_start_date, week_end_date, week_number, year from reporting date
// For monthly: start = first of month, end = last of month, week_number = month (1-12)
// For weekly:  start = 6 days before end, week_number = Amazon week number
function deriveWeekFields(reportingDateStr: string, periodType: 'weekly' | 'monthly' | 'quarterly' = 'weekly') {
  const reportingDate = parseReportingDate(reportingDateStr)
  if (isNaN(reportingDate.getTime())) throw new Error(`Invalid date: ${reportingDateStr}`)

  if (periodType === 'monthly') {
    const year  = reportingDate.getUTCFullYear()
    const month = reportingDate.getUTCMonth() // 0-indexed
    const firstDay = new Date(Date.UTC(year, month, 1))
    const lastDay  = new Date(Date.UTC(year, month + 1, 0))
    return {
      week_start_date: toDateStr(firstDay),
      week_end_date:   toDateStr(lastDay),
      week_number:     month + 1, // 1-indexed month number (1=Jan, 2=Feb, etc.)
      year,
    }
  }

  // Weekly (default) and quarterly — use end date as-is
  const weekEnd   = reportingDate
  const weekStart = new Date(weekEnd)
  weekStart.setUTCDate(weekEnd.getUTCDate() - 6)
  return {
    week_start_date: toDateStr(weekStart),
    week_end_date:   toDateStr(weekEnd),
    week_number:     getAmazonWeekNumber(weekEnd),
    year:            weekEnd.getUTCFullYear(),
  }
}

// ─── PARSE FUNCTION ──────────────────────────────────────────────────────────

type ProductMap = Record<string, { brand_name: string; family_name: string }>
type BrandKeywords = Record<string, string[]>

function parseSQPFile(
  rawText: string,
  productMap: ProductMap,
  brandKeywords: BrandKeywords,
  periodType: 'weekly' | 'monthly' | 'quarterly'
): ParseResult {
  const rows: ParsedRow[] = []
  const unmappedAsins = new Set<string>()
  const errors: string[] = []

  const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalized.split('\n').filter(l => l.trim())
  if (lines.length < 2) return { rows: [], unmappedAsins: [], errors: ['File is empty or has only one row'] }

  const delimiter = detectDelimiter(lines[0])
  const rawHeaders = splitLine(lines[0], delimiter).map(h => h.toLowerCase().trim().replace(/['"]/g, ''))
  const colIndex: Record<string, number> = {}
  rawHeaders.forEach((h, i) => { const mapped = COL_MAP[h]; if (mapped) colIndex[mapped] = i })

  const missing = ['child_asin', 'search_term', 'reporting_date'].filter(r => colIndex[r] === undefined)
  if (missing.length > 0) {
    return { rows: [], unmappedAsins: [], errors: [`Missing required columns: ${missing.join(', ')}. Delimiter: "${delimiter === '\t' ? 'TAB' : 'COMMA'}". Headers: ${rawHeaders.slice(0, 5).join(' | ')}`] }
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const cols = splitLine(line, delimiter)
    const child_asin     = cols[colIndex.child_asin] || ''
    const search_term    = cols[colIndex.search_term] || ''
    const reporting_date = cols[colIndex.reporting_date] || ''
    if (!child_asin || !search_term || !reporting_date) { errors.push(`Row ${i + 1}: missing key value — skipped`); continue }

    const mapping = productMap[child_asin]
    if (!mapping) unmappedAsins.add(child_asin)

    let weekFields
    // Pass periodType so monthly dates are handled correctly
    try { weekFields = deriveWeekFields(reporting_date, periodType) }
    catch { errors.push(`Row ${i + 1}: invalid date "${reporting_date}" — skipped`); continue }

    let is_branded = false
    let brand_keyword_matched: string | null = null
    if (mapping) {
      for (const kw of (brandKeywords[mapping.brand_name] || [])) {
        if (search_term.toLowerCase().includes(kw.toLowerCase())) {
          is_branded = true; brand_keyword_matched = kw; break
        }
      }
    }

    const g = (field: string) => cols[colIndex[field]]
    rows.push({
      child_asin, brand_name: mapping?.brand_name || null, family_name: mapping?.family_name || null,
      ...weekFields, search_term,
      search_query_score: toNum(g('search_query_score')), search_volume: toNum(g('search_volume')),
      impressions_total: toNum(g('impressions_total')), impressions_asin: toNum(g('impressions_asin')), impressions_share_pct: toNum(g('impressions_share_pct')),
      clicks_total: toNum(g('clicks_total')), clicks_rate_pct: toNum(g('clicks_rate_pct')), clicks_asin: toNum(g('clicks_asin')), clicks_share_pct: toNum(g('clicks_share_pct')),
      clicks_price_median: toNum(g('clicks_price_median')), clicks_asin_price_median: toNum(g('clicks_asin_price_median')),
      clicks_same_day_ship: toNum(g('clicks_same_day_ship')), clicks_1d_ship: toNum(g('clicks_1d_ship')), clicks_2d_ship: toNum(g('clicks_2d_ship')),
      cart_adds_total: toNum(g('cart_adds_total')), cart_adds_rate_pct: toNum(g('cart_adds_rate_pct')), cart_adds_asin: toNum(g('cart_adds_asin')), cart_adds_share_pct: toNum(g('cart_adds_share_pct')),
      cart_adds_price_median: toNum(g('cart_adds_price_median')), cart_adds_asin_price_median: toNum(g('cart_adds_asin_price_median')),
      cart_adds_same_day_ship: toNum(g('cart_adds_same_day_ship')), cart_adds_1d_ship: toNum(g('cart_adds_1d_ship')), cart_adds_2d_ship: toNum(g('cart_adds_2d_ship')),
      purchases_total: toNum(g('purchases_total')), purchases_rate_pct: toNum(g('purchases_rate_pct')), purchases_asin: toNum(g('purchases_asin')), purchases_share_pct: toNum(g('purchases_share_pct')),
      purchases_price_median: toNum(g('purchases_price_median')), purchases_asin_price_median: toNum(g('purchases_asin_price_median')),
      purchases_same_day_ship: toNum(g('purchases_same_day_ship')), purchases_1d_ship: toNum(g('purchases_1d_ship')), purchases_2d_ship: toNum(g('purchases_2d_ship')),
      marketplace: g('marketplace') || null, is_branded, brand_keyword_matched,
    })
  }
  return { rows, unmappedAsins: Array.from(unmappedAsins), errors }
}

// ─── DOWNLOAD HELPERS ────────────────────────────────────────────────────────

function downloadUnmappedAsins(asins: string[]) {
  const blob = new Blob(['child_asin\n' + asins.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'unmapped_asins.csv'; a.click()
  URL.revokeObjectURL(url)
}

function downloadDuplicatesCSV(rows: Record<string, unknown>[], filename: string) {
  if (rows.length === 0) return
  const headers = Object.keys(rows[0])
  const csv = [headers.join(','), ...rows.map(row =>
    headers.map(h => { const val = String(row[h] ?? ''); return val.includes(',') ? `"${val}"` : val }).join(',')
  )].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

// ─── COMPONENT ───────────────────────────────────────────────────────────────

export default function SQPUpload() {
  const [periodType, setPeriodType] = useState<'weekly' | 'monthly' | 'quarterly'>('weekly')
  const [file, setFile] = useState<File | null>(null)
  const [parsed, setParsed] = useState<ParseResult | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string | null>(null)
  const [dupResult, setDupResult] = useState<DupResult | null>(null)
  const [checkingDups, setCheckingDups] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [loading, setLoading] = useState(false)
  const [unmappedChoice, setUnmappedChoice] = useState<'keep' | 'skip' | null>(null)

  const tableMap = { weekly: 'sqp_weekly', monthly: 'sqp_monthly', quarterly: 'sqp_quarterly' }

  const reset = () => { setFile(null); setParsed(null); setResult(null); setUnmappedChoice(null); setDupResult(null) }

  const handleFile = useCallback(async (f: File) => {
    setFile(f); setResult(null); setUnmappedChoice(null); setDupResult(null); setLoading(true)
    try {
      const [mappingRes, keywordsRes] = await Promise.all([
        fetch('/api/lookup/product-mapping'),
        fetch('/api/lookup/brand-keywords'),
      ])
      const { mapping } = await mappingRes.json()
      const { keywords } = await keywordsRes.json()
      setParsed(parseSQPFile(await f.text(), mapping, keywords, periodType))
    } catch {
      setParsed({ rows: [], unmappedAsins: [], errors: ['Failed to load reference data from Supabase'] })
    } finally { setLoading(false) }
  }, [periodType])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    const f = e.dataTransfer.files[0]; if (f) handleFile(f)
  }, [handleFile])

  const rowsToUpload = parsed
    ? unmappedChoice === 'skip' ? parsed.rows.filter(r => r.brand_name !== null) : parsed.rows
    : []

  const checkDuplicates = async () => {
    if (!parsed || rowsToUpload.length === 0) return
    setCheckingDups(true); setDupResult(null)
    try {
      const res = await fetch('/api/lookup/check-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: tableMap[periodType], rows: rowsToUpload }),
      })
      setDupResult(await res.json())
    } catch { setDupResult(null) }
    finally { setCheckingDups(false) }
  }

  const hasUnmapped = (parsed?.unmappedAsins.length || 0) > 0
  const canUpload = !hasUnmapped || unmappedChoice !== null

  // For monthly uploads, rename week_* fields to month_* to match sqp_monthly schema
  const transformRowForTable = (row: ParsedRow) => {
    if (periodType !== 'monthly') return row
    const { week_start_date, week_end_date, week_number, ...rest } = row
    return {
      ...rest,
      month_start_date: week_start_date,
      month_end_date: week_end_date,
      month_number: week_number,
    }
  }

  const handleUpload = async () => {
    if (!parsed || rowsToUpload.length === 0) return
    setUploading(true)
    try {
      const CHUNK_SIZE = 500
      let totalInserted = 0, totalSkipped = 0
      const allErrors: string[] = []
      for (let i = 0; i < rowsToUpload.length; i += CHUNK_SIZE) {
        const chunk = rowsToUpload.slice(i, i + CHUNK_SIZE).map(transformRowForTable)
        setUploadProgress(`Uploading batch ${Math.floor(i / CHUNK_SIZE) + 1} of ${Math.ceil(rowsToUpload.length / CHUNK_SIZE)}...`)
        const res = await fetch('/api/upload-sqp', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: chunk, table: tableMap[periodType] }),
        })
        const data = await res.json()
        totalInserted += data.inserted || 0; totalSkipped += data.skipped || 0
        if (data.errors?.length) allErrors.push(...data.errors)
        await new Promise(r => setTimeout(r, 100))
      }
      setResult({ inserted: totalInserted, skipped: totalSkipped, total: rowsToUpload.length, unmapped: parsed.unmappedAsins.length, errors: allErrors.length > 0 ? allErrors : undefined })
    } catch {
      setResult({ inserted: 0, skipped: 0, total: 0, unmapped: 0, errors: ['Network error'] })
    } finally { setUploading(false); setUploadProgress(null) }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">SQP Data</h2>
        <p className="text-sm text-gray-400">Upload your Amazon Search Query Performance reports. Brand and family are assigned automatically from your product mapping. Branded terms are detected automatically from your brand keywords.</p>
      </div>

      {/* Period selector */}
      <div>
        <p className="text-xs font-medium text-gray-500 mb-2">REPORT PERIOD</p>
        <div className="flex gap-2">
          {(['weekly', 'monthly', 'quarterly'] as const).map(p => (
            <button key={p} onClick={() => { setPeriodType(p); reset() }}
              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${periodType === p ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'}`}>
              {p}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-2">
          {periodType === 'monthly'
            ? 'Monthly reports use "MMM-YY" date format (e.g. Feb-26). Month start/end dates and month number are derived automatically.'
            : 'Week dates and week numbers are derived automatically from the Reporting Date column using Amazon\'s week numbering.'}
          {' '}CSV and TSV both supported.
        </p>
      </div>

      {/* Drop zone */}
      {!file && (
        <div onDrop={handleDrop} onDragOver={(e) => { e.preventDefault(); setDragOver(true) }} onDragLeave={() => setDragOver(false)}
          className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${dragOver ? 'border-blue-500 bg-blue-500/5' : 'border-gray-700 hover:border-gray-600'}`}>
          <div className="text-4xl mb-3">📊</div>
          <p className="text-sm font-medium text-gray-300">Drop your SQP file here</p>
          <p className="text-xs text-gray-500 mt-1 mb-4">CSV or TSV — comma or tab separated</p>
          <label className="cursor-pointer bg-gray-800 hover:bg-gray-700 text-white text-sm px-4 py-2 rounded-lg transition-colors">
            Choose File
            <input type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
          </label>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-3 py-8 justify-center">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-400">Parsing file and looking up brand data...</p>
        </div>
      )}

      {/* Parsed preview */}
      {parsed && !result && !loading && (
        <div className="space-y-4">

          {/* Stats */}
          <div className="grid grid-cols-4 gap-4">
            <StatCard label="Rows Ready" value={parsed.rows.length} color="green" />
            <StatCard label="Unmapped ASINs" value={parsed.unmappedAsins.length} color={hasUnmapped ? 'yellow' : 'gray'} />
            <StatCard label="Parse Errors" value={parsed.errors.length} color={parsed.errors.length > 0 ? 'red' : 'gray'} />
            <StatCard label="Period" value={periodType} color="blue" small />
          </div>

          {/* Period info box */}
          {parsed.rows.length > 0 && (() => {
            const periodSet = new Map<string, { week: number; year: number }>()
            for (const r of parsed.rows) {
              const key = `${r.year}-${String(r.week_number).padStart(2, '0')}`
              periodSet.set(key, { week: r.week_number, year: r.year })
            }
            const periods = Array.from(periodSet.values()).sort((a, b) => a.year !== b.year ? a.year - b.year : a.week - b.week)
            const sequences: { start: typeof periods[0]; end: typeof periods[0] }[] = []
            let seqStart = periods[0], prev = periods[0]
            for (let i = 1; i < periods.length; i++) {
              const curr = periods[i]
              const isConsecutive = (curr.year === prev.year && curr.week === prev.week + 1) || (curr.year === prev.year + 1 && prev.week >= (periodType === 'monthly' ? 12 : 52) && curr.week === 1)
              if (!isConsecutive) { sequences.push({ start: seqStart, end: prev }); seqStart = curr }
              prev = curr
            }
            sequences.push({ start: seqStart, end: prev })
            const pl = (p: typeof periods[0]) => periodType === 'monthly' ? `M${p.week}/${p.year}` : `W${p.week}/${p.year}`
            const sequenceStr = sequences.map(s => s.start.week === s.end.week && s.start.year === s.end.year ? pl(s.start) : `${pl(s.start)} to ${pl(s.end)}`).join(', ')
            const allStarts = parsed.rows.map(r => r.week_start_date).sort()
            const allEnds = parsed.rows.map(r => r.week_end_date).sort()
            return (
              <div className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 text-xs text-gray-400">
                <p className="text-gray-300 font-medium mb-1">{periodType === 'monthly' ? 'Months' : 'Weeks'} detected from file:</p>
                <p>• <span className="text-white">{periodType === 'monthly' ? 'Months' : 'Weeks'}:</span> {sequenceStr}</p>
                <p>• <span className="text-white">Start Date:</span> {allStarts[0]}</p>
                <p>• <span className="text-white">End Date:</span> {allEnds[allEnds.length - 1]}</p>
                <p>• <span className="text-white">Total unique {periodType === 'monthly' ? 'months' : 'weeks'}:</span> {periods.length}</p>
              </div>
            )
          })()}

          {/* Unmapped ASINs */}
          {hasUnmapped && (
            <div className="bg-yellow-950/30 border border-yellow-800 rounded-lg p-4 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-yellow-400">⚠️ {parsed.unmappedAsins.length} ASINs not in product mapping</p>
                  <p className="text-xs text-yellow-300 mt-0.5">Choose what to do with these rows before uploading</p>
                </div>
                <button onClick={() => downloadUnmappedAsins(parsed.unmappedAsins)}
                  className="flex items-center gap-1.5 bg-yellow-900/50 hover:bg-yellow-800/60 text-yellow-300 text-xs px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ml-4">
                  ⬇ Download List
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {parsed.unmappedAsins.slice(0, 10).map(a => (
                  <span key={a} className="bg-yellow-900/40 text-yellow-300 text-xs font-mono px-2 py-1 rounded">{a}</span>
                ))}
                {parsed.unmappedAsins.length > 10 && <span className="text-xs text-yellow-400">...and {parsed.unmappedAsins.length - 10} more</span>}
              </div>
              <div className="border-t border-yellow-800 pt-4">
                <p className="text-xs font-medium text-yellow-400 mb-3">SELECT ONE — required before uploading:</p>
                <div className="flex gap-3">
                  {(['keep', 'skip'] as const).map(choice => (
                    <button key={choice} onClick={() => setUnmappedChoice(choice)}
                      className={`flex items-center gap-2.5 px-4 py-3 rounded-lg border text-sm transition-colors flex-1 ${unmappedChoice === choice ? 'border-blue-500 bg-blue-500/10 text-white' : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600 hover:text-gray-300'}`}>
                      <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${unmappedChoice === choice ? 'border-blue-500' : 'border-gray-600'}`}>
                        {unmappedChoice === choice && <span className="w-2 h-2 rounded-full bg-blue-500" />}
                      </span>
                      <div className="text-left">
                        <p className="font-medium">{choice === 'keep' ? 'Keep unmapped rows' : 'Skip unmapped rows'}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{choice === 'keep' ? 'Upload all rows — unmapped ones have brand_name = null' : 'Only upload rows with a known brand — exclude the rest'}</p>
                      </div>
                    </button>
                  ))}
                </div>
                {unmappedChoice && (
                  <p className="text-xs text-gray-400 mt-3">
                    {unmappedChoice === 'skip'
                      ? `${rowsToUpload.length.toLocaleString()} rows will be uploaded (${(parsed.rows.length - rowsToUpload.length).toLocaleString()} unmapped excluded)`
                      : `${rowsToUpload.length.toLocaleString()} rows will be uploaded (all rows including ${parsed.unmappedAsins.length} unmapped)`}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Duplicate Check */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-300">Duplicate Check <span className="text-xs text-gray-500 font-normal ml-1">— optional</span></p>
                <p className="text-xs text-gray-500 mt-0.5">See how many rows already exist in the database before uploading</p>
              </div>
              <button onClick={checkDuplicates} disabled={checkingDups || (hasUnmapped && unmappedChoice === null)}
                className="bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs px-4 py-2 rounded-lg transition-colors whitespace-nowrap">
                {checkingDups ? 'Checking...' : 'Check Duplicates'}
              </button>
            </div>

            {dupResult && !checkingDups && (
              <div className="space-y-4 pt-2 border-t border-gray-800">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-400">Already in database</p>
                    <p className={`text-xl font-bold ${dupResult.databaseCount > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
                      {dupResult.databaseCount.toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">will be upserted</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">New rows to insert</p>
                    <p className="text-xl font-bold text-green-400">
                      {dupResult.newRows.toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">net new to database</p>
                  </div>
                </div>

                {dupResult.databaseCount > 0 && (
                  <div className="bg-yellow-950/20 border border-yellow-800 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-medium text-yellow-400">
                        ⚠ {dupResult.databaseCount} rows already exist in the database
                      </p>
                      <button onClick={() => downloadDuplicatesCSV(dupResult.databaseDuplicates, 'database_duplicates.csv')}
                        className="text-xs text-yellow-300 hover:text-yellow-200 bg-yellow-900/40 px-3 py-1 rounded">
                        ⬇ Download CSV
                      </button>
                    </div>
                    <p className="text-xs text-gray-500">
                      Matched on ASIN + search term + week. These will be upserted if KPIs changed.
                    </p>
                  </div>
                )}

                {dupResult.databaseCount === 0 && (
                  <p className="text-xs text-green-400">✓ No duplicates found — all rows are new</p>
                )}
              </div>
            )}
          </div>

          {/* Parse errors */}
          {parsed.errors.length > 0 && (
            <div className="bg-red-950/30 border border-red-900 rounded-lg p-4">
              <p className="text-sm font-medium text-red-400 mb-2">Parse Issues</p>
              <ul className="space-y-1">
                {parsed.errors.slice(0, 5).map((e, i) => <li key={i} className="text-xs text-red-300">{e}</li>)}
                {parsed.errors.length > 5 && <li className="text-xs text-red-400">...and {parsed.errors.length - 5} more</li>}
              </ul>
            </div>
          )}

          {/* Preview table */}
          {parsed.rows.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-400 mb-2">PREVIEW — first 5 rows</p>
              <div className="overflow-x-auto rounded-lg border border-gray-800">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-900">
                      {['child_asin','brand_name','family_name','week_number','week_start_date','search_term','search_volume','impressions_share_pct','is_branded'].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-gray-400 font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.slice(0, 5).map((row, i) => (
                      <tr key={i} className="border-t border-gray-800">
                        <td className="px-3 py-2 font-mono text-blue-300 whitespace-nowrap">{row.child_asin}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{row.brand_name || <span className="text-yellow-400">unmapped</span>}</td>
                        <td className="px-3 py-2 text-gray-300 whitespace-nowrap">{row.family_name || '—'}</td>
                        <td className="px-3 py-2 text-gray-300 whitespace-nowrap">{row.week_number}</td>
                        <td className="px-3 py-2 text-gray-300 whitespace-nowrap">{row.week_start_date}</td>
                        <td className="px-3 py-2 text-gray-300 max-w-[180px] truncate">{row.search_term}</td>
                        <td className="px-3 py-2 text-gray-300 whitespace-nowrap">{row.search_volume?.toLocaleString() || '—'}</td>
                        <td className="px-3 py-2 text-gray-300 whitespace-nowrap">{row.impressions_share_pct ?? '—'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{row.is_branded ? <span className="text-green-400">✓ branded</span> : <span className="text-gray-500">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Upload button */}
          <div className="flex gap-3 items-center">
            <button onClick={handleUpload} disabled={uploading || rowsToUpload.length === 0 || !canUpload}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm px-6 py-2.5 rounded-lg font-medium transition-colors">
              {uploading ? (uploadProgress || 'Uploading...') : `Upload ${rowsToUpload.length.toLocaleString()} rows → sqp_${periodType}`}
            </button>
            <button onClick={reset} className="bg-gray-800 hover:bg-gray-700 text-white text-sm px-4 py-2.5 rounded-lg transition-colors">Cancel</button>
            {hasUnmapped && !unmappedChoice && <p className="text-xs text-yellow-400">← Select keep or skip above to enable upload</p>}
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-4">
          <div className={`rounded-lg border p-5 ${result.errors?.length ? 'bg-yellow-950/20 border-yellow-800' : 'bg-green-950/20 border-green-800'}`}>
            <p className="font-semibold text-white mb-4">{result.errors?.length ? '⚠️ Upload completed with errors' : '✅ Upload successful'}</p>
            <div className="grid grid-cols-4 gap-4">
              <div><p className="text-xs text-gray-400">Inserted</p><p className="text-2xl font-bold text-green-400">{result.inserted.toLocaleString()}</p></div>
              <div><p className="text-xs text-gray-400">Skipped (duplicates)</p><p className="text-2xl font-bold text-yellow-400">{result.skipped.toLocaleString()}</p></div>
              <div><p className="text-xs text-gray-400">Unmapped ASINs</p><p className="text-2xl font-bold text-orange-400">{result.unmapped.toLocaleString()}</p></div>
              <div><p className="text-xs text-gray-400">Total rows</p><p className="text-2xl font-bold text-gray-300">{result.total.toLocaleString()}</p></div>
            </div>
          </div>
          <button onClick={reset} className="bg-gray-800 hover:bg-gray-700 text-white text-sm px-4 py-2.5 rounded-lg transition-colors">Upload another file</button>
        </div>
      )}
    </div>
  )
}

// ─── STAT CARD ───────────────────────────────────────────────────────────────

function StatCard({ label, value, color, small }: {
  label: string; value: number | string
  color: 'green' | 'red' | 'gray' | 'blue' | 'yellow'; small?: boolean
}) {
  const colors = { green: 'text-green-400', red: 'text-red-400', gray: 'text-gray-300', blue: 'text-blue-400', yellow: 'text-yellow-400' }
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`font-bold mt-1 ${colors[color]} ${small ? 'text-sm truncate capitalize' : 'text-2xl'}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
    </div>
  )
}