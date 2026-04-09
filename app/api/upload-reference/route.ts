import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CONFLICT_KEYS: Record<string, string> = {
  product_mapping:  'child_asin',
  brand_keywords:   'brand_name,keyword',
  keyword_tracker:  'brand_name,family_name,keyword',
}

export async function POST(req: NextRequest) {
  try {
    const { rows, table } = await req.json()

    if (!rows || !table) {
      return NextResponse.json({ error: 'Missing rows or table' }, { status: 400 })
    }

    if (!CONFLICT_KEYS[table]) {
      return NextResponse.json({ error: `Unknown table: ${table}` }, { status: 400 })
    }

    const { error, count } = await supabase
      .from(table)
      .upsert(rows, {
        onConflict: CONFLICT_KEYS[table],
        count: 'exact',
      })

    if (error) {
      console.error('upload-reference error:', error)
      return NextResponse.json({
        inserted: 0,
        skipped: 0,
        total: rows.length,
        errors: [error.message],
      })
    }

    return NextResponse.json({
      inserted: count ?? rows.length,
      skipped: rows.length - (count ?? rows.length),
      total: rows.length,
      errors: [],
    })

  } catch (err: unknown) {
    console.error('upload-reference error:', err)
    return NextResponse.json({
      inserted: 0,
      skipped: 0,
      total: 0,
      errors: [String(err)],
    }, { status: 500 })
  }
}