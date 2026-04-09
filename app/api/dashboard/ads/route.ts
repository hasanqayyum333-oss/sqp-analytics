import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { brands, families, adTypes, viewMode, filterValue, mode, allWeeks, startDate, endDate } = await req.json()

    const table   = mode === 'monthly' ? 'ad_search_terms_monthly' : 'ad_search_terms_weekly'
    const dateCol = mode === 'monthly' ? 'month_start_date'        : 'week_start_date'

    let q = supabase
      .from(table)
      .select(`${dateCol}, week_number, ad_type, impressions, clicks, spend, total_sales, total_orders`)

    if (brands?.length   > 0) q = q.in('brand_name',  brands)
    if (families?.length > 0) q = q.in('family_name', families)
    if (adTypes?.length  > 0) q = q.in('ad_type',     adTypes)

    if (filterValue) {
      if (viewMode === 'search_term') q = q.ilike('customer_search_term', `%${filterValue}%`)
      if (viewMode === 'keyword')     q = q.ilike('targeting',            `%${filterValue}%`)
    }

    // Date range filter for modal (allWeeks mode)
    if (allWeeks && startDate) q = q.gte(dateCol, startDate)
    if (allWeeks && endDate)   q = q.lte(dateCol, endDate)

    q = q.order(dateCol, { ascending: false }).limit(10000)

    const { data: rows, error } = await q
    if (error) throw error
    if (!rows || rows.length === 0) return NextResponse.json({ current: null, previous: null, weeks: [] })

    // Group by date key
    const dateMap = new Map<string, typeof rows>()
    for (const row of rows) {
      const dk = row[dateCol] as string
      if (!dateMap.has(dk)) dateMap.set(dk, [])
      dateMap.get(dk)!.push(row)
    }

    const allDates = [...dateMap.keys()].sort().reverse()

    const aggregate = (dateKey: string) => {
      const subset = dateMap.get(dateKey) ?? []
      if (!subset.length) return null
      const impressions = subset.reduce((s, r) => s + (Number(r.impressions)  || 0), 0)
      const clicks      = subset.reduce((s, r) => s + (Number(r.clicks)       || 0), 0)
      const spend       = subset.reduce((s, r) => s + (Number(r.spend)        || 0), 0)
      const sales       = subset.reduce((s, r) => s + (Number(r.total_sales)  || 0), 0)
      const orders      = subset.reduce((s, r) => s + (Number(r.total_orders) || 0), 0)
      return {
        dateKey,
        weekNumber: subset[0].week_number as number,
        impressions, clicks, spend, sales, orders,
        ctr:  impressions > 0 ? (clicks / impressions) * 100 : 0,
        cvr:  clicks      > 0 ? (orders / clicks)      * 100 : 0,
        acos: sales       > 0 ? (spend  / sales)       * 100 : 0,
        roas: spend       > 0 ?  sales  / spend              : 0,
        cpc:  clicks      > 0 ?  spend  / clicks             : 0,
      }
    }

    // allWeeks mode: return all weeks as array (for modal table)
    if (allWeeks) {
      const weeks = allDates.map(dk => aggregate(dk)).filter(Boolean)
      return NextResponse.json({ weeks, current: weeks[0] ?? null, previous: weeks[1] ?? null })
    }

    // Default: return just latest 2 weeks (for main page pills)
    return NextResponse.json({
      current:  aggregate(allDates[0]),
      previous: allDates[1] ? aggregate(allDates[1]) : null,
    })

  } catch (err) {
    console.error('ads route error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}