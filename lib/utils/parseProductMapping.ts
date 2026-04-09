// Parses product mapping CSV
// Expected columns (by name, case insensitive):
// child_asin, parent_asin, family_name, brand_name, product_name

export interface ProductMappingRow {
  child_asin: string
  parent_asin: string
  family_name: string
  brand_name: string
  product_name?: string
  is_active: boolean
}

export interface ParseResult {
  rows: ProductMappingRow[]
  errors: string[]
  unmapped: number
}

// Normalize header names to our column names
const HEADER_MAP: Record<string, string> = {
  child_asin:   'child_asin',
  'child asin': 'child_asin',
  childasin:    'child_asin',
  asin:         'child_asin',

  parent_asin:   'parent_asin',
  'parent asin': 'parent_asin',
  parentasin:    'parent_asin',

  family_name:   'family_name',
  'family name': 'family_name',
  familyname:    'family_name',
  family:        'family_name',

  brand_name:   'brand_name',
  'brand name': 'brand_name',
  brandname:    'brand_name',
  brand:        'brand_name',

  product_name:        'product_name',
  'product name':      'product_name',
  productname:         'product_name',
  'product description': 'product_name',
  description:         'product_name',
  title:               'product_name',
}

export function parseProductMappingCSV(csvText: string): ParseResult {
  const rows: ProductMappingRow[] = []
  const errors: string[] = []
  let unmapped = 0

  const lines = csvText.split('\n').filter(l => l.trim())
  if (lines.length < 2) {
    return { rows: [], errors: ['File is empty or has no data rows'], unmapped: 0 }
  }

  // Parse headers
  const headers = parseCSVLine(lines[0]).map(h =>
    h.toLowerCase().trim().replace(/['"]/g, '')
  )

  const colIndex: Record<string, number> = {}
  headers.forEach((h, i) => {
    const mapped = HEADER_MAP[h]
    if (mapped) colIndex[mapped] = i
  })

  const required = ['child_asin', 'parent_asin', 'family_name', 'brand_name']
  const missing = required.filter(r => colIndex[r] === undefined)
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [`Missing required columns: ${missing.join(', ')}`],
      unmapped: 0,
    }
  }

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const cols = parseCSVLine(line)

    const child_asin = clean(cols[colIndex.child_asin])
    const parent_asin = clean(cols[colIndex.parent_asin])
    const family_name = clean(cols[colIndex.family_name])
    const brand_name = clean(cols[colIndex.brand_name])
    const product_name = colIndex.product_name !== undefined
      ? clean(cols[colIndex.product_name])
      : undefined

    if (!child_asin || !parent_asin || !family_name || !brand_name) {
      errors.push(`Row ${i + 1}: missing required value — skipped`)
      unmapped++
      continue
    }

    rows.push({
      child_asin,
      parent_asin,
      family_name,
      brand_name,
      product_name: product_name || undefined,
      is_active: true,
    })
  }

  return { rows, errors, unmapped }
}

// Handle quoted CSV fields
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

function clean(val: string | undefined): string {
  return (val || '').trim().replace(/^["']|["']$/g, '')
}