import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── Types ─────────────────────────────────────────────────────────────────────

type TermAgg = {
  weekKey:        string;
  weekEnd:        string;
  weekNumber:     number;
  year:           number;
  searchTerm:     string;
  searchVolume:   number;
  mktImpressions: number; ourImpressions: number;
  mktClicks:      number; ourClicks:      number;
  mktCartAdds:    number; ourCartAdds:    number;
  mktPurchases:   number; ourPurchases:   number;
  mktRevenue:     number; ourRevenue:     number;
  termSeen:       boolean;
};

// ── Helper ────────────────────────────────────────────────────────────────────

function aggregateRows(
  rows: Record<string, unknown>[],
  dateKeyField: string,
  dateEndField:  string,
  periodNumField: string,
) {
  const aggMap = new Map<string, TermAgg>();

  for (const row of rows) {
    const dateKey   = String(row[dateKeyField] ?? '');
    const termLower = String(row.search_term ?? '').toLowerCase().trim();
    const key       = `${termLower}|${dateKey}`;

    if (!aggMap.has(key)) {
      aggMap.set(key, {
        weekKey:        dateKey,
        weekEnd:        String(row[dateEndField]   ?? ''),
        weekNumber:     Number(row[periodNumField] ?? 0),
        year:           Number(row.year            ?? 0),
        searchTerm:     String(row.search_term     ?? ''),
        searchVolume:   0,
        mktImpressions: 0, ourImpressions: 0,
        mktClicks:      0, ourClicks:      0,
        mktCartAdds:    0, ourCartAdds:    0,
        mktPurchases:   0, ourPurchases:   0,
        mktRevenue:     0, ourRevenue:     0,
        termSeen:       false,
      });
    }

    const agg = aggMap.get(key)!;

    // Market totals — count once per search_term per period
    if (!agg.termSeen) {
      agg.termSeen        = true;
      agg.searchVolume   += Number(row.search_volume)     || 0;
      agg.mktImpressions += Number(row.impressions_total) || 0;
      agg.mktClicks      += Number(row.clicks_total)      || 0;
      agg.mktCartAdds    += Number(row.cart_adds_total)   || 0;
      agg.mktPurchases   += Number(row.purchases_total)   || 0;
      agg.mktRevenue     +=
        (Number(row.purchases_price_median) || 0) *
        (Number(row.purchases_total)        || 0);
    }

    // Our totals — sum across all ASINs
    agg.ourImpressions += Number(row.impressions_asin)  || 0;
    agg.ourClicks      += Number(row.clicks_asin)       || 0;
    agg.ourCartAdds    += Number(row.cart_adds_asin)    || 0;
    agg.ourPurchases   += Number(row.purchases_asin)    || 0;
    agg.ourRevenue     +=
      (Number(row.purchases_asin_price_median) || 0) *
      (Number(row.purchases_asin)              || 0);
  }

  // Remove termSeen, sort by searchVolume DESC then weekKey DESC
  return Array.from(aggMap.values())
    .map((entry) => {
      const out: Partial<TermAgg> = { ...entry };
      delete out.termSeen;
      return out as Omit<TermAgg, 'termSeen'>;
    })
    .sort((a, b) =>
      b.searchVolume - a.searchVolume ||
      b.weekKey.localeCompare(a.weekKey)
    );
}

// ── Route ─────────────────────────────────────────────────────────────────────
//
// This route is called by the "View Branded Terms" modal on the trends page.
// It always fetches rows WHERE is_branded = true from the sqp tables,
// filtered to the selected brand/family/asin and date range.
// It is NOT affected by the kwMode selector — it always shows branded terms.

export async function POST(req: NextRequest) {
  try {
    const { brands, families, asins, mode, startDate, endDate } = await req.json();
    const isMonthly = mode === 'monthly';

    const hasFilter = (brands?.length > 0) || (families?.length > 0) || (asins?.length > 0);
    if (!hasFilter) return NextResponse.json({ data: [] });

    // ── Step 1: Resolve ASINs ─────────────────────────────────────────────
    let relevantAsins: string[] = asins?.length > 0 ? asins : [];
    if (relevantAsins.length === 0) {
      let q = supabase.from('product_mapping').select('child_asin');
      if (families?.length > 0)    q = q.in('family_name', families);
      else if (brands?.length > 0) q = q.in('brand_name',  brands);
      const { data } = await q;
      relevantAsins = (data ?? []).map((r: { child_asin: string }) => r.child_asin);
    }
    if (relevantAsins.length === 0) return NextResponse.json({ data: [] });

    // ── Step 2: Fetch branded rows from the correct sqp table ─────────────
    const table         = isMonthly ? 'sqp_monthly'      : 'sqp_weekly';
    const dateField     = isMonthly ? 'month_start_date'  : 'week_start_date';
    const dateEndField  = isMonthly ? 'month_end_date'    : 'week_end_date';
    const periodNumFld  = isMonthly ? 'month_number'      : 'week_number';

    const selectCols = [
      dateField, dateEndField, periodNumFld, 'year',
      'search_term', 'child_asin', 'search_volume',
      'impressions_asin', 'impressions_total',
      'clicks_asin',      'clicks_total',
      'cart_adds_asin',   'cart_adds_total',
      'purchases_asin',   'purchases_total',
      'purchases_asin_price_median',
      'purchases_price_median',
    ].join(',');

    const { data: rows, error } = await supabase
      .from(table)
      .select(selectCols)
      .in('child_asin', relevantAsins)
      .gte(dateField, startDate)
      .lte(dateField, endDate)
      .eq('is_branded', true)           // ← always branded only
      .order(dateField, { ascending: false });

    if (error) throw error;
    if (!rows || rows.length === 0) return NextResponse.json({ data: [] });

    const result = aggregateRows(
      rows as unknown as Record<string, unknown>[],
      dateField,
      dateEndField,
      periodNumFld,
    );

    return NextResponse.json({ data: result });

  } catch (err) {
    console.error('branded-terms route error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}