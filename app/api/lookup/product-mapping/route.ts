import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const { data, error } = await supabase
    .from('product_mapping')
    .select('child_asin, brand_name, family_name')
    .eq('is_active', true)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Build lookup map: child_asin → { brand_name, family_name }
  const mapping: Record<string, { brand_name: string; family_name: string }> = {}
  for (const row of data || []) {
    mapping[row.child_asin] = {
      brand_name: row.brand_name,
      family_name: row.family_name,
    }
  }

  return NextResponse.json({ mapping })
}