import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const { data, error } = await supabase
    .from('product_mapping')
    .select('parent_asin, brand_name, family_name')
    .eq('is_active', true)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Build lookup map: parent_asin → { brand_name, family_name }
  // Multiple child ASINs can share a parent_asin — just need one entry per parent
  const mapping: Record<string, { brand_name: string; family_name: string }> = {}
  for (const row of data || []) {
    if (row.parent_asin && !mapping[row.parent_asin]) {
      mapping[row.parent_asin] = {
        brand_name: row.brand_name,
        family_name: row.family_name,
      }
    }
  }

  return NextResponse.json({ mapping })
}