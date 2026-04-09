import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 120

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const VALID_TABLES = ['sqp_weekly', 'sqp_monthly', 'sqp_quarterly']

// Deduplicate rows by conflict key — keep last occurrence
// Uses the correct date column depending on the target table
function deduplicateRows(rows: Record<string, unknown>[], table: string): Record<string, unknown>[] {
  const seen = new Map<string, Record<string, unknown>>()
  const dateKey = table === 'sqp_monthly' ? 'month_start_date' : 'week_start_date'
  for (const row of rows) {
    const key = `${row.child_asin}|${row.search_term}|${row[dateKey]}`
    seen.set(key, row)
  }
  return Array.from(seen.values())
}

// Retry upsert up to 3 times on connection errors
// Uses the correct onConflict columns depending on the target table
async function upsertWithRetry(
  table: string,
  rows: Record<string, unknown>[],
  retries = 3
): Promise<{ error: { message: string } | null }> {
  const conflictKey =
    table === 'sqp_monthly'
      ? 'child_asin,search_term,month_start_date'
      : 'child_asin,search_term,week_start_date'

  for (let attempt = 1; attempt <= retries; attempt++) {
    const { error } = await supabase
      .from(table)
      .upsert(rows, {
        onConflict: conflictKey,
      })

    if (!error) return { error: null }

    const isRetryable =
      error.message?.includes('fetch failed') ||
      error.message?.includes('EPIPE') ||
      error.message?.includes('socket') ||
      error.message?.includes('network')

    if (!isRetryable || attempt === retries) return { error }

    // Wait before retrying: 1s, 2s, 3s
    await new Promise(r => setTimeout(r, attempt * 1000))
  }
  return { error: { message: 'Max retries exceeded' } }
}

export async function POST(req: NextRequest) {
  try {
    const { rows, table } = await req.json()

    if (!rows || !table) {
      return NextResponse.json({ error: 'Missing rows or table' }, { status: 400 })
    }

    if (!VALID_TABLES.includes(table)) {
      return NextResponse.json({ error: `Invalid table: ${table}` }, { status: 400 })
    }

    // Deduplicate within the batch before sending to Supabase
    // Pass table so the correct date column is used for dedup key
    const dedupedRows = deduplicateRows(rows, table)
    const duplicatesRemoved = rows.length - dedupedRows.length

    const { error } = await upsertWithRetry(table, dedupedRows)

    if (error) {
      console.error('upload-sqp error:', error)
      return NextResponse.json({
        inserted: 0,
        skipped: rows.length,
        duplicatesRemoved,
        total: rows.length,
        errors: [error.message],
      })
    }

    return NextResponse.json({
      inserted: dedupedRows.length,
      skipped: 0,
      duplicatesRemoved,
      total: rows.length,
      errors: [],
    })

  } catch (err: unknown) {
    console.error('upload-sqp error:', err)
    return NextResponse.json({
      inserted: 0,
      skipped: 0,
      duplicatesRemoved: 0,
      total: 0,
      errors: [String(err)],
    }, { status: 500 })
  }
}