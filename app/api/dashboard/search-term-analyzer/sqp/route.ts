import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type SqpRow = {
  search_volume: number;
  impressions_total: number;
  impressions_asin: number;
  clicks_total: number;
  clicks_asin: number;
  cart_adds_total: number;
  cart_adds_asin: number;
  purchases_total: number;
  purchases_asin: number;
  purchases_price_median: number;
  purchases_asin_price_median: number;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Lightweight route — fetches SQP data for the selected term only
// Called only when the SQP columns toggle is ON and a row is selected

export async function POST(req: NextRequest) {
  try {
    const { term, brands, families, asins, startDate, endDate, mode } = await req.json();

    if (!term) return NextResponse.json({ data: null });

    const isMonthly = mode === 'monthly';
    const table     = isMonthly ? 'sqp_monthly'      : 'sqp_weekly';
    const dateField = isMonthly ? 'month_start_date'  : 'week_start_date';
    const prevField = isMonthly ? 'month_end_date'    : 'week_end_date';

    // Resolve ASINs
    let relevantAsins: string[] = asins?.length > 0 ? asins : [];
    if (relevantAsins.length === 0) {
      let q = supabase.from('product_mapping').select('child_asin');
      if (families?.length > 0)    q = q.in('family_name', families);
      else if (brands?.length > 0) q = q.in('brand_name',  brands);
      const { data } = await q;
      relevantAsins = (data ?? []).map((r: { child_asin: string }) => r.child_asin);
    }
    if (relevantAsins.length === 0) return NextResponse.json({ data: null });

    const selectCols = [
      dateField, prevField, 'search_term', 'child_asin',
      'search_volume',
      'impressions_asin', 'impressions_total',
      'clicks_asin',      'clicks_total',
      'cart_adds_asin',   'cart_adds_total',
      'purchases_asin',   'purchases_total',
      'purchases_asin_price_median', 'purchases_price_median',
    ].join(',');

    const { data: rows, error } = await supabase
      .from(table)
      .select(selectCols)
      .in('child_asin', relevantAsins)
      .eq('search_term', term.toLowerCase().trim())
      .gte(dateField, startDate)
      .lte(dateField, endDate);

    if (error) throw error;
    if (!rows || rows.length === 0) return NextResponse.json({ data: null });

    // Aggregate across ASINs — market deduped per search_term, ours summed
    let searchVolume      = 0;
    let mktImpressions    = 0;
    let ourImpressions    = 0;
    let mktClicks         = 0;
    let ourClicks         = 0;
    let mktCartAdds       = 0;
    let ourCartAdds       = 0;
    let mktPurchases      = 0;
    let ourPurchases      = 0;
    let mktRevenue        = 0;
    let ourRevenue        = 0;
    let termSeen          = false;

    for (const row of (rows as unknown) as SqpRow[]) {
      if (!termSeen) {
        termSeen          = true;
        searchVolume      = Number(row.search_volume)     || 0;
        mktImpressions    = Number(row.impressions_total) || 0;
        mktClicks         = Number(row.clicks_total)      || 0;
        mktCartAdds       = Number(row.cart_adds_total)   || 0;
        mktPurchases      = Number(row.purchases_total)   || 0;
        mktRevenue        = (Number(row.purchases_price_median) || 0) * (Number(row.purchases_total) || 0);
      }
      ourImpressions     += Number(row.impressions_asin)  || 0;
      ourClicks          += Number(row.clicks_asin)       || 0;
      ourCartAdds        += Number(row.cart_adds_asin)    || 0;
      ourPurchases       += Number(row.purchases_asin)    || 0;
      ourRevenue         += (Number(row.purchases_asin_price_median) || 0) * (Number(row.purchases_asin) || 0);
    }

    const impressionShare = mktImpressions > 0 ? (ourImpressions / mktImpressions) * 100 : 0;
    const clickShare      = mktClicks      > 0 ? (ourClicks      / mktClicks)      * 100 : 0;
    const cartShare       = mktCartAdds    > 0 ? (ourCartAdds    / mktCartAdds)    * 100 : 0;
    const purchaseShare   = mktPurchases   > 0 ? (ourPurchases   / mktPurchases)   * 100 : 0;
    const revenueShare    = mktRevenue     > 0 ? (ourRevenue     / mktRevenue)     * 100 : 0;

    // ── Previous period for WoW ──────────────────────────────────────────
    const start     = new Date(startDate);
    const end       = new Date(endDate);
    const days      = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    const prevEnd   = new Date(start); prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - (days - 1));
    const prevStartStr = prevStart.toISOString().split('T')[0];
    const prevEndStr   = prevEnd.toISOString().split('T')[0];

    const { data: prevRows } = await supabase
      .from(table)
      .select(selectCols)
      .in('child_asin', relevantAsins)
      .eq('search_term', term.toLowerCase().trim())
      .gte(dateField, prevStartStr)
      .lte(dateField, prevEndStr);

    let prevSearchVolume   = 0;
    let prevImprShare      = 0;
    let prevClkShare       = 0;
    let prevCartShare      = 0;
    let prevPurchShare     = 0;
    let prevRevShare       = 0;
    let hasPrev            = false;

    if (prevRows && prevRows.length > 0) {
      hasPrev = true;
      let pMktImpr = 0, pOurImpr = 0, pMktClk = 0, pOurClk = 0;
      let pMktCart = 0, pOurCart = 0, pMktPurch = 0, pOurPurch = 0;
      let pMktRev  = 0, pOurRev  = 0;
      let pSeen    = false;
      for (const row of (prevRows as unknown) as SqpRow[]) {
        if (!pSeen) {
          pSeen          = true;
          prevSearchVolume = Number(row.search_volume) || 0;
          pMktImpr = Number(row.impressions_total) || 0;
          pMktClk  = Number(row.clicks_total)      || 0;
          pMktCart = Number(row.cart_adds_total)   || 0;
          pMktPurch= Number(row.purchases_total)   || 0;
          pMktRev  = (Number(row.purchases_price_median) || 0) * (Number(row.purchases_total) || 0);
        }
        pOurImpr  += Number(row.impressions_asin)  || 0;
        pOurClk   += Number(row.clicks_asin)       || 0;
        pOurCart  += Number(row.cart_adds_asin)    || 0;
        pOurPurch += Number(row.purchases_asin)    || 0;
        pOurRev   += (Number(row.purchases_asin_price_median) || 0) * (Number(row.purchases_asin) || 0);
      }
      prevImprShare  = pMktImpr  > 0 ? (pOurImpr  / pMktImpr)  * 100 : 0;
      prevClkShare   = pMktClk   > 0 ? (pOurClk   / pMktClk)   * 100 : 0;
      prevCartShare  = pMktCart  > 0 ? (pOurCart  / pMktCart)  * 100 : 0;
      prevPurchShare = pMktPurch > 0 ? (pOurPurch / pMktPurch) * 100 : 0;
      prevRevShare   = pMktRev   > 0 ? (pOurRev   / pMktRev)   * 100 : 0;
    }

    return NextResponse.json({
      data: {
        searchVolume,
        searchVolumeDelta:    hasPrev && prevSearchVolume > 0 ? ((searchVolume - prevSearchVolume) / prevSearchVolume) * 100 : null,
        impressionShare,
        impressionShareDelta: hasPrev ? impressionShare - prevImprShare   : null,
        clickShare,
        clickShareDelta:      hasPrev ? clickShare      - prevClkShare    : null,
        cartShare,
        cartShareDelta:       hasPrev ? cartShare       - prevCartShare   : null,
        purchaseShare,
        purchaseShareDelta:   hasPrev ? purchaseShare   - prevPurchShare  : null,
        revenueShare,
        revenueShareDelta:    hasPrev ? revenueShare    - prevRevShare    : null,
      }
    });

  } catch (err) {
    console.error('sta-sqp route error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}