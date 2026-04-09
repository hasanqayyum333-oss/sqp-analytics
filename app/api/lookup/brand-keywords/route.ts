import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const { data, error } = await supabase
    .from('brand_keywords')
    .select('brand_name, keyword')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Build lookup map: brand_name → [keywords]
  const keywords: Record<string, string[]> = {}
  for (const row of data || []) {
    if (!keywords[row.brand_name]) keywords[row.brand_name] = []
    keywords[row.brand_name].push(row.keyword)
  }

  return NextResponse.json({ keywords })
}