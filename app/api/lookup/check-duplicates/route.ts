import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type ParsedRow = Record<string, unknown>

function identityKey(row: ParsedRow): string {
  return `${row.child_asin}|${row.search_term}|${row.week_start_date}`
}

async function fetchAllExisting(
  table: string,
  asins: string[]
): Promise<Set<string>> {
  const existingSet = new Set<string>()
  const PAGE_SIZE = 1000
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('child_asin, search_term, week_start_date')
      .in('child_asin', asins)
      .range(from, from + PAGE_SIZE - 1)

    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break

    for (const row of data) {
      existingSet.add(`${row.child_asin}|${row.search_term}|${row.week_start_date}`)
    }

    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return existingSet
}

export async function POST(req: Request) {
  try {
    const { table, rows }: { table: string; rows: ParsedRow[] } = await req.json()

    const uniqueAsins = [...new Set(rows.map(r => String(r.child_asin)))]
    const ASIN_BATCH = 500
    const existingSet = new Set<string>()

    for (let i = 0; i < uniqueAsins.length; i += ASIN_BATCH) {
      const batch = uniqueAsins.slice(i, i + ASIN_BATCH)
      const batchSet = await fetchAllExisting(table, batch)
      batchSet.forEach(k => existingSet.add(k))
    }

    const databaseDuplicates: ParsedRow[] = []
    for (const row of rows) {
      if (existingSet.has(identityKey(row))) databaseDuplicates.push(row)
    }

    return NextResponse.json({
      databaseCount: databaseDuplicates.length,
      databaseDuplicates: databaseDuplicates.slice(0, 500),
      totalChecked: rows.length,
      newRows: rows.length - databaseDuplicates.length,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}