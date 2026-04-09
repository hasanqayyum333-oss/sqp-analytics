'use client'

import { useState, useCallback } from 'react'
import SQPUpload from './SQPUpload'
import SearchTermsUpload from './SearchTermsUpload'

// ─── TYPES ──────────────────────────────────────────────────────────────────

interface UploadResult {
  inserted: number
  skipped: number
  total: number
  errors?: string[]
}

interface ParsedData {
  rows: Record<string, unknown>[]
  errors: string[]
}

// ─── TEMPLATES ──────────────────────────────────────────────────────────────

const TEMPLATES = {
  product_mapping: {
    filename: 'product_mapping_template.csv',
    headers: ['child_asin', 'parent_asin', 'family_name', 'brand_name', 'product_name'],
    example: ['B09XK2YABC', 'B09XK2Y000', 'Yoga Pro Mat', 'Yoga Pro', 'Yoga Pro Mat Black 6mm'],
  },
  brand_keywords: {
    filename: 'brand_keywords_template.csv',
    headers: ['brand_name', 'keyword'],
    example: ['Yoga Pro', 'yoga pro'],
  },
  keyword_tracker: {
    filename: 'keyword_tracker_template.csv',
    headers: ['brand_name', 'family_name', 'keyword'],
    example: ['Yoga Pro', 'Yoga Pro Mat', 'yoga mat non slip'],
  },
}

function downloadTemplate(table: keyof typeof TEMPLATES) {
  const t = TEMPLATES[table]
  const csv = [t.headers.join(','), t.example.join(',')].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = t.filename
  a.click()
  URL.revokeObjectURL(url)
}

// ─── CSV PARSER ─────────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
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
  return result
}

function clean(val: string | undefined): string {
  return (val || '').trim().replace(/^["']|["']$/g, '')
}

const HEADER_ALIASES: Record<string, string> = {
  child_asin: 'child_asin', 'child asin': 'child_asin', childasin: 'child_asin', asin: 'child_asin',
  parent_asin: 'parent_asin', 'parent asin': 'parent_asin', parentasin: 'parent_asin',
  family_name: 'family_name', 'family name': 'family_name', familyname: 'family_name', family: 'family_name',
  brand_name: 'brand_name', 'brand name': 'brand_name', brandname: 'brand_name', brand: 'brand_name',
  product_name: 'product_name', 'product name': 'product_name', description: 'product_name', title: 'product_name',
  keyword: 'keyword', word: 'keyword', term: 'keyword', 'branded word': 'keyword', 'brand word': 'keyword',
}

function parseCSV(csvText: string, requiredCols: string[]): ParsedData {
  const rows: Record<string, unknown>[] = []
  const errors: string[] = []

  const lines = csvText.split('\n').filter(l => l.trim())
  if (lines.length < 2) return { rows: [], errors: ['File is empty or has no data rows'] }

  const rawHeaders = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim().replace(/['"]/g, ''))
  const colIndex: Record<string, number> = {}
  rawHeaders.forEach((h, i) => {
    const mapped = HEADER_ALIASES[h]
    if (mapped) colIndex[mapped] = i
  })

  const missing = requiredCols.filter(r => colIndex[r] === undefined)
  if (missing.length > 0) {
    return { rows: [], errors: [`Missing required columns: ${missing.join(', ')}`] }
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const cols = parseCSVLine(line)
    const row: Record<string, unknown> = {}
    let valid = true

    for (const col of requiredCols) {
      const val = clean(cols[colIndex[col]])
      if (!val) {
        errors.push(`Row ${i + 1}: missing ${col} — skipped`)
        valid = false
        break
      }
      row[col] = val
    }

    if (!valid) continue

    Object.entries(colIndex).forEach(([col, idx]) => {
      if (!row[col]) {
        const val = clean(cols[idx])
        if (val) row[col] = val
      }
    })

    rows.push(row)
  }

  return { rows, errors }
}

// ─── TABLE CONFIGS ───────────────────────────────────────────────────────────

const TABLE_CONFIGS = {
  product_mapping: {
    label: 'Product Mapping',
    description: 'Links child ASINs to parent ASINs, product families, and brands. Upload this first — all other data maps from here.',
    required: ['child_asin', 'parent_asin', 'family_name', 'brand_name'],
    optional: ['product_name'],
    previewCols: ['child_asin', 'parent_asin', 'family_name', 'brand_name', 'product_name'],
    transform: (row: Record<string, unknown>): Record<string, unknown> => ({ ...row, is_active: true }),
  },
  brand_keywords: {
    label: 'Brand Keywords',
    description: 'Keywords used to detect branded search queries. Any search term containing these words (for the matching brand) will be flagged as branded.',
    required: ['brand_name', 'keyword'],
    optional: [],
    previewCols: ['brand_name', 'keyword'],
    transform: (row: Record<string, unknown>): Record<string, unknown> => row,
  },
  keyword_tracker: {
    label: 'Keyword Tracker',
    description: 'Curated keywords per product family for stable market tracking. Only these keywords appear in the tracked view — filters out noise from irrelevant search terms.',
    required: ['brand_name', 'family_name', 'keyword'],
    optional: [],
    previewCols: ['brand_name', 'family_name', 'keyword'],
    transform: (row: Record<string, unknown>): Record<string, unknown> => row,
  },
}

type TableKey = keyof typeof TABLE_CONFIGS

// ─── MAIN PAGE ───────────────────────────────────────────────────────────────

export default function UploadPage() {
  const [activeTab, setActiveTab] = useState<'reference' | 'sqp' | 'bulk'>('reference')

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="border-b border-gray-800 px-8 py-5">
        <h1 className="text-xl font-semibold text-white">Data Upload</h1>
        <p className="text-sm text-gray-400 mt-1">Upload reference tables, SQP reports, and Ad Search Terms</p>
      </div>

      <div className="border-b border-gray-800 px-8">
        <div className="flex gap-6">
          {[
            { key: 'reference', label: '1. Reference Tables' },
            { key: 'sqp',       label: '2. SQP Data' },
            { key: 'bulk',      label: '3. Ad Search Terms' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={`py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-8 py-8 max-w-4xl">
        {activeTab === 'reference' && <ReferenceTablesSection />}
        {activeTab === 'sqp'       && <SQPUpload />}
        {activeTab === 'bulk'      && <SearchTermsUpload />}
      </div>
    </div>
  )
}

// ─── REFERENCE TABLES SECTION ────────────────────────────────────────────────

function ReferenceTablesSection() {
  const [activeTable, setActiveTable] = useState<TableKey>('product_mapping')

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">Reference Tables</h2>
        <p className="text-sm text-gray-400">
          Upload these first. All SQP and Ad Search Term data maps to these reference tables for brand assignment and keyword classification.
        </p>
      </div>

      <div className="flex gap-2">
        {(Object.keys(TABLE_CONFIGS) as TableKey[]).map(key => (
          <button
            key={key}
            onClick={() => setActiveTable(key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTable === key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            {TABLE_CONFIGS[key].label}
          </button>
        ))}
      </div>

      <ReferenceUploader key={activeTable} tableKey={activeTable} />
    </div>
  )
}

// ─── REFERENCE UPLOADER ──────────────────────────────────────────────────────

function ReferenceUploader({ tableKey }: { tableKey: TableKey }) {
  const config = TABLE_CONFIGS[tableKey]
  const [file, setFile] = useState<File | null>(null)
  const [parsed, setParsed] = useState<ParsedData | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const reset = () => { setFile(null); setParsed(null); setResult(null) }

  const handleFile = useCallback((f: File) => {
    setFile(f)
    setResult(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      setParsed(parseCSV(text, config.required))
    }
    reader.readAsText(f)
  }, [config.required])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f && f.name.endsWith('.csv')) handleFile(f)
  }, [handleFile])

  const handleUpload = async () => {
    if (!parsed || parsed.rows.length === 0) return
    setUploading(true)
    try {
      const res = await fetch('/api/upload-reference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: parsed.rows.map(config.transform), table: tableKey }),
      })
      setResult(await res.json())
    } catch {
      setResult({ inserted: 0, skipped: 0, total: 0, errors: ['Network error'] })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-4">
        <p className="text-sm text-gray-300">{config.description}</p>

        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">COLUMNS</p>
          <div className="flex flex-wrap gap-2">
            {config.required.map(col => (
              <span key={col} className="bg-gray-800 border border-gray-700 rounded px-2.5 py-1 text-xs font-mono text-white">
                {col} <span className="text-blue-400 ml-1">required</span>
              </span>
            ))}
            {config.optional.map(col => (
              <span key={col} className="bg-gray-800 border border-gray-700 rounded px-2.5 py-1 text-xs font-mono text-gray-400">
                {col} <span className="text-gray-500 ml-1">optional</span>
              </span>
            ))}
          </div>
        </div>

        <div className="pt-3 border-t border-gray-800">
          <button
            onClick={() => downloadTemplate(tableKey as keyof typeof TEMPLATES)}
            className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            <span>⬇</span>
            <span>Download CSV Template</span>
          </button>
          <p className="text-xs text-gray-500 mt-1">
            Fill in the template and upload below. Column order doesn&apos;t matter.
          </p>
        </div>
      </div>

      {!file && (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
            dragOver ? 'border-blue-500 bg-blue-500/5' : 'border-gray-700 hover:border-gray-600'
          }`}
        >
          <div className="text-4xl mb-3">📄</div>
          <p className="text-sm font-medium text-gray-300">Drop your CSV file here</p>
          <p className="text-xs text-gray-500 mt-1 mb-4">or click to browse</p>
          <label className="cursor-pointer bg-gray-800 hover:bg-gray-700 text-white text-sm px-4 py-2 rounded-lg transition-colors">
            Choose CSV File
            <input type="file" accept=".csv" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
          </label>
        </div>
      )}

      {parsed && !result && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <StatCard label="Rows Ready" value={parsed.rows.length} color="green" />
            <StatCard label="Rows Skipped" value={parsed.errors.length} color={parsed.errors.length > 0 ? 'red' : 'gray'} />
            <StatCard label="File" value={file?.name || ''} color="gray" small />
          </div>

          {parsed.errors.length > 0 && (
            <div className="bg-red-950/30 border border-red-900 rounded-lg p-4">
              <p className="text-sm font-medium text-red-400 mb-2">Parse Issues (rows skipped)</p>
              <ul className="space-y-1">
                {parsed.errors.slice(0, 8).map((e, i) => <li key={i} className="text-xs text-red-300">{e}</li>)}
                {parsed.errors.length > 8 && <li className="text-xs text-red-400">...and {parsed.errors.length - 8} more</li>}
              </ul>
            </div>
          )}

          {parsed.rows.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-400 mb-2">PREVIEW — first 5 rows</p>
              <div className="overflow-x-auto rounded-lg border border-gray-800">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-900">
                      {config.previewCols.map(h => (
                        <th key={h} className="px-3 py-2 text-left text-gray-400 font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.slice(0, 5).map((row, i) => (
                      <tr key={i} className="border-t border-gray-800">
                        {config.previewCols.map(col => (
                          <td key={col} className="px-3 py-2 text-gray-300 whitespace-nowrap">
                            {String(row[col] ?? '—')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={handleUpload} disabled={uploading || parsed.rows.length === 0}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm px-6 py-2.5 rounded-lg font-medium transition-colors">
              {uploading ? 'Uploading...' : `Upload ${parsed.rows.length.toLocaleString()} rows to ${config.label}`}
            </button>
            <button onClick={reset} className="bg-gray-800 hover:bg-gray-700 text-white text-sm px-4 py-2.5 rounded-lg transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className={`rounded-lg border p-5 ${result.errors?.length ? 'bg-yellow-950/20 border-yellow-800' : 'bg-green-950/20 border-green-800'}`}>
            <p className="font-semibold text-white mb-4">
              {result.errors?.length ? '⚠️ Upload completed with errors' : '✅ Upload successful'}
            </p>
            <div className="grid grid-cols-3 gap-4 mb-3">
              <div><p className="text-xs text-gray-400">Inserted</p><p className="text-2xl font-bold text-green-400">{result.inserted.toLocaleString()}</p></div>
              <div><p className="text-xs text-gray-400">Skipped (duplicates)</p><p className="text-2xl font-bold text-yellow-400">{result.skipped.toLocaleString()}</p></div>
              <div><p className="text-xs text-gray-400">Total rows</p><p className="text-2xl font-bold text-gray-300">{result.total.toLocaleString()}</p></div>
            </div>
            {result.errors && result.errors.length > 0 && (
              <ul className="space-y-1 mt-2 pt-3 border-t border-yellow-900">
                {result.errors.map((e, i) => <li key={i} className="text-xs text-yellow-300">{e}</li>)}
              </ul>
            )}
          </div>
          <button onClick={reset} className="bg-gray-800 hover:bg-gray-700 text-white text-sm px-4 py-2.5 rounded-lg transition-colors">
            Upload another file
          </button>
        </div>
      )}
    </div>
  )
}

// ─── SHARED ──────────────────────────────────────────────────────────────────

function StatCard({ label, value, color, small }: {
  label: string; value: number | string; color: 'green' | 'red' | 'gray' | 'blue'; small?: boolean
}) {
  const colors = { green: 'text-green-400', red: 'text-red-400', gray: 'text-gray-300', blue: 'text-blue-400' }
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`font-bold mt-1 ${colors[color]} ${small ? 'text-sm truncate' : 'text-2xl'}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
    </div>
  )
}