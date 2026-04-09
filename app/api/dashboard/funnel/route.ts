import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type PeriodAgg = {
  periodEnd: string; periodNumber: number; year: number;
  searchVolume: number;
  mktImpressions: number; ourImpressions: number;
  mktClicks: number;      ourClicks: number;
  mktCartAdds: number;    ourCartAdds: number;
  mktPurchases: number;   ourPurchases: number;
  mktRevenueSum: number;  ourRevenueSum: number;
  termSeen: Set<string>;
};

export async function POST(req: NextRequest) {
  try {
    const { asins, families, brands, startDate, endDate, keyword, mode } = await req.json();
    const isMonthly = mode === 'monthly';

    // ── Step 1: Resolve ASINs ────────────────────────────────────────────────
    let relevantAsins: string[] = asins?.length > 0 ? asins : [];
    if (relevantAsins.length === 0) {
      let q = supabase.from('product_mapping').select('child_asin');
      if (families?.length > 0) q = q.in('family_name', families);
      else if (brands?.length > 0) q = q.in('brand_name', brands);
      const { data } = await q;
      relevantAsins = (data ?? []).map((r: { child_asin: string }) => r.child_asin);
    }
    if (relevantAsins.length === 0) return NextResponse.json({ data: [] });

    // ── Step 2: Resolve families ─────────────────────────────────────────────
    const { data: asinData } = await supabase
      .from('product_mapping')
      .select('child_asin, family_name')
      .in('child_asin', relevantAsins);
    const relevantFamilies = [
      ...new Set((asinData ?? []).map((r: { family_name: string }) => r.family_name)),
    ];

    // ── Step 3: Resolve keywords ─────────────────────────────────────────────
    let keywords: string[] | null = null;
    if (keyword) {
      keywords = [keyword.trim()];
    } else {
      const { data: trackedData } = await supabase
        .from('keyword_tracker')
        .select('keyword')
        .in('family_name', relevantFamilies);
      if (trackedData && trackedData.length > 0) {
        keywords = [...new Set(trackedData.map((r: { keyword: string }) => r.keyword.trim()))];
      }
    }
    if (!keywords || keywords.length === 0) {
      return NextResponse.json({ data: [], noKeywords: true });
    }

    // ── Step 4: Fetch rows ───────────────────────────────────────────────────
    type RawRow = Record<string, unknown>;
    let rows: RawRow[] = [];

    if (isMonthly) {
      // Monthly: query sqp_monthly directly (no RPC — same pattern as trends route)
      const selectCols = [
        'month_start_date', 'month_end_date', 'month_number', 'year',
        'child_asin', 'search_term', 'search_volume',
        'impressions_total', 'impressions_asin',
        'clicks_total', 'clicks_asin',
        'cart_adds_total', 'cart_adds_asin',
        'purchases_total', 'purchases_asin',
        'purchases_price_median', 'purchases_asin_price_median',
      ].join(',');

      let q = supabase
        .from('sqp_monthly')
        .select(selectCols)
        .in('child_asin', relevantAsins)
        .gte('month_start_date', startDate)
        .lte('month_start_date', endDate)
        .order('month_start_date');

      // Case-insensitive keyword filter
      const kwLower = keywords.map(k => k.toLowerCase());
      q = q.in('search_term', kwLower);

      const { data: monthRows, error: monthErr } = await q;
      if (monthErr) throw monthErr;
      rows = ((monthRows ?? []) as unknown) as RawRow[];
    } else {
      // Weekly: use existing RPC (case-insensitive matching, handles large keyword sets)
      const { data: weekRows, error: weekErr } = await supabase.rpc('get_funnel_data', {
        p_asins:      relevantAsins,
        p_keywords:   keywords,
        p_start_date: startDate,
        p_end_date:   endDate,
      });
      if (weekErr) throw weekErr;
      rows = (weekRows ?? []) as RawRow[];
    }

    if (!rows || rows.length === 0) return NextResponse.json({ data: [] });

    // ── Step 5: Aggregate per period ─────────────────────────────────────────
    const dateKey    = isMonthly ? 'month_start_date' : 'week_start_date';
    const dateEnd    = isMonthly ? 'month_end_date'   : 'week_end_date';
    const periodNum  = isMonthly ? 'month_number'     : 'week_number';

    const periodMap = new Map<string, PeriodAgg>();

    for (const row of rows) {
      const pk = String(row[dateKey]);
      if (!periodMap.has(pk)) {
        periodMap.set(pk, {
          periodEnd:    String(row[dateEnd]),
          periodNumber: Number(row[periodNum]),
          year:         Number(row.year),
          searchVolume: 0,
          mktImpressions: 0, ourImpressions: 0,
          mktClicks: 0,      ourClicks: 0,
          mktCartAdds: 0,    ourCartAdds: 0,
          mktPurchases: 0,   ourPurchases: 0,
          mktRevenueSum: 0,  ourRevenueSum: 0,
          termSeen: new Set<string>(),
        });
      }
      const agg = periodMap.get(pk)!;
      const termKey = `${String(row.search_term ?? '').toLowerCase().trim()}|${pk}`;

      // Market totals: deduplicate per search_term per period
      if (!agg.termSeen.has(termKey)) {
        agg.termSeen.add(termKey);
        agg.searchVolume   += Number(row.search_volume)     || 0;
        agg.mktImpressions += Number(row.impressions_total) || 0;
        agg.mktClicks      += Number(row.clicks_total)      || 0;
        agg.mktCartAdds    += Number(row.cart_adds_total)   || 0;
        agg.mktPurchases   += Number(row.purchases_total)   || 0;
        agg.mktRevenueSum  +=
          (Number(row.purchases_price_median) || 0) * (Number(row.purchases_total) || 0);
      }

      // Our totals: sum across all ASINs
      agg.ourImpressions += Number(row.impressions_asin)  || 0;
      agg.ourClicks      += Number(row.clicks_asin)       || 0;
      agg.ourCartAdds    += Number(row.cart_adds_asin)    || 0;
      agg.ourPurchases   += Number(row.purchases_asin)    || 0;
      agg.ourRevenueSum  +=
        (Number(row.purchases_asin_price_median) || 0) * (Number(row.purchases_asin) || 0);
    }

    // ── Step 6: Build response ───────────────────────────────────────────────
    const result = Array.from(periodMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([periodKey, p]) => {
        const impressionShare = p.mktImpressions > 0 ? (p.ourImpressions / p.mktImpressions) * 100 : 0;
        const clickShare      = p.mktClicks      > 0 ? (p.ourClicks      / p.mktClicks)      * 100 : 0;
        const cartAddShare    = p.mktCartAdds    > 0 ? (p.ourCartAdds    / p.mktCartAdds)    * 100 : 0;
        const purchaseShare   = p.mktPurchases   > 0 ? (p.ourPurchases   / p.mktPurchases)   * 100 : 0;
        const revenueShare    = p.mktRevenueSum  > 0 ? (p.ourRevenueSum  / p.mktRevenueSum)  * 100 : 0;
        const mktCTR = p.mktImpressions > 0 ? (p.mktClicks    / p.mktImpressions) * 100 : 0;
        const ourCTR = p.ourImpressions > 0 ? (p.ourClicks    / p.ourImpressions) * 100 : 0;
        const mktATC = p.mktClicks      > 0 ? (p.mktCartAdds  / p.mktClicks)      * 100 : 0;
        const ourATC = p.ourClicks      > 0 ? (p.ourCartAdds  / p.ourClicks)      * 100 : 0;
        const mktCVR = p.mktClicks      > 0 ? (p.mktPurchases / p.mktClicks)      * 100 : 0;
        const ourCVR = p.ourClicks      > 0 ? (p.ourPurchases / p.ourClicks)      * 100 : 0;

        return {
          weekKey: periodKey, weekEnd: p.periodEnd,
          weekNumber: p.periodNumber, year: p.year,
          searchVolume: p.searchVolume,
          mktImpressions: p.mktImpressions, ourImpressions: p.ourImpressions, impressionShare,
          mktClicks:    p.mktClicks,    ourClicks:    p.ourClicks,    clickShare,    mktCTR, ourCTR,
          mktCartAdds:  p.mktCartAdds,  ourCartAdds:  p.ourCartAdds,  cartAddShare,  mktATC, ourATC,
          mktPurchases: p.mktPurchases, ourPurchases: p.ourPurchases, purchaseShare, mktCVR, ourCVR,
          mktRevenue: p.mktRevenueSum,  ourRevenue: p.ourRevenueSum,  revenueShare,
        };
      });

    return NextResponse.json({ data: result });
  } catch (err) {
    console.error('funnel route error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}