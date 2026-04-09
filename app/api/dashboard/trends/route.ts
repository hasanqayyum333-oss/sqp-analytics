import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── TYPES ────────────────────────────────────────────────────────────────────

interface MonthAgg {
  dateKey:             string;
  endDateVal:          string;
  periodNumber:        number;
  year:                number;
  searchVolume:        number;
  ourImpressions:      number;
  marketImpressions:   number;
  ourClicks:           number;
  marketClicks:        number;
  ourCartAdds:         number;
  marketCartAdds:      number;
  ourPurchases:        number;
  marketPurchases:     number;
  ourClickPriceSum:    number;
  mktClickPriceSum:    number;
  mktClickVol:         number;
  ourCartPriceSum:     number;
  mktCartPriceSum:     number;
  mktCartVol:          number;
  ourPurchasePriceSum: number;
  mktPurchasePriceSum: number;
  mktPurchaseVol:      number;
}

interface MonthlyRow {
  month_start_date:             string;
  month_end_date:               string;
  month_number:                 number;
  year:                         number;
  search_term:                  string;
  child_asin:                   string;
  search_volume:                number | null;
  impressions_asin:             number | null;
  impressions_total:            number | null;
  clicks_asin:                  number | null;
  clicks_total:                 number | null;
  cart_adds_asin:               number | null;
  cart_adds_total:              number | null;
  purchases_asin:               number | null;
  purchases_total:              number | null;
  clicks_asin_price_median:     number | null;
  clicks_price_median:          number | null;
  cart_adds_asin_price_median:  number | null;
  cart_adds_price_median:       number | null;
  purchases_asin_price_median:  number | null;
  purchases_price_median:       number | null;
}

// ── ROUTE ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { asins, families, brands, startDate, endDate, mode } = body;
    const kwMode: string = body.kwMode ?? 'both';
    const isMonthly = mode === 'monthly';

    const hasFilter = (asins?.length > 0) || (families?.length > 0) || (brands?.length > 0);
    if (!hasFilter) return NextResponse.json({ data: [], requiresFilter: true });

    // ── Step 1: Resolve ASINs ────────────────────────────────────────────────
    let relevantAsins: string[] = asins?.length > 0 ? asins : [];
    if (relevantAsins.length === 0) {
      let q = supabase.from('product_mapping').select('child_asin, family_name');
      if (families?.length > 0) q = q.in('family_name', families);
      else if (brands?.length > 0) q = q.in('brand_name', brands);
      const { data } = await q;
      relevantAsins = (data ?? []).map((r: { child_asin: string }) => r.child_asin);
    }
    if (relevantAsins.length === 0) return NextResponse.json({ data: [] });

    // ── Step 2: Get families for these ASINs ─────────────────────────────────
    const { data: asinData } = await supabase
      .from('product_mapping').select('child_asin, family_name')
      .in('child_asin', relevantAsins);
    const asinFamilyMap: Record<string, string> = {};
    for (const r of (asinData ?? [])) asinFamilyMap[r.child_asin] = r.family_name;
    const relevantFamilies = [...new Set(Object.values(asinFamilyMap))];

    // ── Step 3: Resolve keywords ──────────────────────────────────────────────
    //
    // MONTHLY: keyword_tracker is the source of truth.
    //   is_branded on keyword_tracker is reliable.
    //   non-branded → keyword_tracker WHERE is_branded = false
    //   branded     → keyword_tracker WHERE is_branded = true
    //   both        → keyword_tracker (no is_branded filter)
    //   Result is passed as a single .in('search_term', keywords) to sqp_monthly.
    //
    // WEEKLY: keyword_tracker for generic, sqp_weekly for branded.
    //   sqp_weekly.is_branded is reliably populated.
    //   non-branded → keyword_tracker (all tracked keywords)
    //   branded     → sqp_weekly WHERE is_branded = true
    //   both        → merge both sources
    //   Result passed as p_keywords to the RPC.

    // ── MONTHLY PATH ─────────────────────────────────────────────────────────
    if (isMonthly) {

      // Build keyword list from keyword_tracker
      let kwQuery = supabase
        .from('keyword_tracker')
        .select('keyword')
        .in('family_name', relevantFamilies);

      if (kwMode === 'non-branded') kwQuery = (kwQuery as any).eq('is_branded', false);
      if (kwMode === 'branded')     kwQuery = (kwQuery as any).eq('is_branded', true);
      // kwMode === 'both' → no filter → fetch all

      const { data: trackedData, error: kwError } = await kwQuery;
      if (kwError) throw kwError;

      const kwSet = new Set<string>();
      for (const r of (trackedData ?? [])) kwSet.add(r.keyword.toLowerCase().trim());
      const monthlyKeywords = kwSet.size > 0 ? Array.from(kwSet) : null;

      if (!monthlyKeywords || monthlyKeywords.length === 0) {
        return NextResponse.json({ data: [] });
      }

      // Single query — all modes use the same .in('search_term') approach
      const selectCols = [
        'month_start_date', 'month_end_date', 'month_number', 'year',
        'search_term', 'child_asin', 'search_volume',
        'impressions_asin', 'impressions_total',
        'clicks_asin', 'clicks_total',
        'cart_adds_asin', 'cart_adds_total',
        'purchases_asin', 'purchases_total',
        'clicks_asin_price_median', 'clicks_price_median',
        'cart_adds_asin_price_median', 'cart_adds_price_median',
        'purchases_asin_price_median', 'purchases_price_median',
      ].join(',');

      const { data: rawData, error } = await supabase
        .from('sqp_monthly')
        .select(selectCols)
        .in('child_asin', relevantAsins)
        .gte('month_start_date', startDate)
        .lte('month_start_date', endDate)
        .in('search_term', monthlyKeywords)
        .order('month_start_date');

      if (error) throw error;
      if (!rawData || rawData.length === 0) return NextResponse.json({ data: [] });

      const rows = rawData as unknown as MonthlyRow[];

      // ── Aggregate ──────────────────────────────────────────────────────────
      const termDateSeen = new Set<string>();
      const periodMap    = new Map<string, MonthAgg>();

      for (const row of rows) {
        const dateKey = row.month_start_date;
        const termKey = `${row.search_term}|${dateKey}`;

        if (!periodMap.has(dateKey)) {
          periodMap.set(dateKey, {
            dateKey,
            endDateVal:          row.month_end_date,
            periodNumber:        row.month_number,
            year:                row.year,
            searchVolume:        0,
            ourImpressions:      0, marketImpressions:   0,
            ourClicks:           0, marketClicks:        0,
            ourCartAdds:         0, marketCartAdds:      0,
            ourPurchases:        0, marketPurchases:     0,
            ourClickPriceSum:    0, mktClickPriceSum:    0, mktClickVol:         0,
            ourCartPriceSum:     0, mktCartPriceSum:     0, mktCartVol:          0,
            ourPurchasePriceSum: 0, mktPurchasePriceSum: 0, mktPurchaseVol:      0,
          });
        }

        const agg = periodMap.get(dateKey)!;

        // Market — deduplicate per search_term per month
        if (!termDateSeen.has(termKey)) {
          termDateSeen.add(termKey);
          agg.searchVolume      += Number(row.search_volume)     || 0;
          agg.marketImpressions += Number(row.impressions_total) || 0;
          agg.marketClicks      += Number(row.clicks_total)      || 0;
          agg.marketCartAdds    += Number(row.cart_adds_total)   || 0;
          agg.marketPurchases   += Number(row.purchases_total)   || 0;
          agg.mktClickPriceSum    += (Number(row.clicks_price_median)    || 0) * (Number(row.clicks_total)    || 0);
          agg.mktClickVol         += Number(row.clicks_total)    || 0;
          agg.mktCartPriceSum     += (Number(row.cart_adds_price_median) || 0) * (Number(row.cart_adds_total) || 0);
          agg.mktCartVol          += Number(row.cart_adds_total) || 0;
          agg.mktPurchasePriceSum += (Number(row.purchases_price_median) || 0) * (Number(row.purchases_total) || 0);
          agg.mktPurchaseVol      += Number(row.purchases_total) || 0;
        }

        // Ours — sum across all ASINs
        agg.ourImpressions      += Number(row.impressions_asin)  || 0;
        agg.ourClicks           += Number(row.clicks_asin)       || 0;
        agg.ourCartAdds         += Number(row.cart_adds_asin)    || 0;
        agg.ourPurchases        += Number(row.purchases_asin)    || 0;
        agg.ourClickPriceSum    += (Number(row.clicks_asin_price_median)    || 0) * (Number(row.clicks_asin)    || 0);
        agg.ourCartPriceSum     += (Number(row.cart_adds_asin_price_median) || 0) * (Number(row.cart_adds_asin) || 0);
        agg.ourPurchasePriceSum += (Number(row.purchases_asin_price_median) || 0) * (Number(row.purchases_asin) || 0);
      }

      const result = Array.from(periodMap.values())
        .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
        .map(p => buildMonthRow(p));

      return NextResponse.json({ data: result });
    }

    // ── WEEKLY PATH (RPC) ─────────────────────────────────────────────────────
    // Build finalKeywords: keyword_tracker for generic, sqp_weekly for branded.

    let genericKeywords: string[] | null = null;
    let brandedKeywords: string[] | null = null;

    if (kwMode === 'non-branded' || kwMode === 'both') {
      const { data: trackedData } = await supabase
        .from('keyword_tracker')
        .select('keyword')
        .in('family_name', relevantFamilies);

      const set = new Set<string>();
      for (const r of (trackedData ?? [])) set.add(r.keyword.toLowerCase().trim());
      genericKeywords = set.size > 0 ? Array.from(set) : null;
    }

    if (kwMode === 'branded' || kwMode === 'both') {
      // sqp_weekly.is_branded is reliably populated
      const { data: brandedRows } = await supabase
        .from('sqp_weekly')
        .select('search_term')
        .in('child_asin', relevantAsins)
        .gte('week_start_date', startDate)
        .lte('week_start_date', endDate)
        .eq('is_branded', true);

      const set = new Set<string>(
        (brandedRows ?? []).map((r: { search_term: string }) =>
          r.search_term.toLowerCase().trim()
        )
      );
      brandedKeywords = set.size > 0 ? Array.from(set) : null;
    }

    let finalKeywords: string[] | null = null;
    if (kwMode === 'non-branded') {
      finalKeywords = genericKeywords;
    } else if (kwMode === 'branded') {
      finalKeywords = brandedKeywords;
    } else {
      // both — merge and deduplicate
      const merged = new Set<string>([
        ...(genericKeywords ?? []),
        ...(brandedKeywords ?? []),
      ]);
      finalKeywords = merged.size > 0 ? Array.from(merged) : null;
    }

    const { data: rows, error } = await supabase.rpc('get_trends_aggregated', {
      p_asins:      relevantAsins,
      p_start_date: startDate,
      p_end_date:   endDate,
      p_keywords:   finalKeywords,
    });
    if (error) throw error;

    const result = (rows ?? []).map((p: {
      date_key: string; end_date: string; period_number: number; year: number;
      search_volume: number;
      our_impressions: number; market_impressions: number;
      our_clicks: number; market_clicks: number;
      our_cart_adds: number; market_cart_adds: number;
      our_purchases: number; market_purchases: number;
      our_click_price: number; market_click_price: number;
      our_cart_price: number; market_cart_price: number;
      our_purchase_price: number; market_purchase_price: number;
    }) => ({
      dateKey:      p.date_key,
      endDate:      p.end_date,
      periodNumber: p.period_number,
      year:         p.year,
      searchVolume:      Number(p.search_volume),
      ourImpressions:    Number(p.our_impressions),
      marketImpressions: Number(p.market_impressions),
      ourClicks:         Number(p.our_clicks),
      marketClicks:      Number(p.market_clicks),
      ourCartAdds:       Number(p.our_cart_adds),
      marketCartAdds:    Number(p.market_cart_adds),
      ourPurchases:      Number(p.our_purchases),
      marketPurchases:   Number(p.market_purchases),
      impressionShare: p.market_impressions > 0 ? (p.our_impressions / p.market_impressions) * 100 : 0,
      clickShare:      p.market_clicks      > 0 ? (p.our_clicks      / p.market_clicks)      * 100 : 0,
      cartAddShare:    p.market_cart_adds   > 0 ? (p.our_cart_adds   / p.market_cart_adds)   * 100 : 0,
      purchaseShare:   p.market_purchases   > 0 ? (p.our_purchases   / p.market_purchases)   * 100 : 0,
      ourClickPrice:       Number(p.our_click_price)       || null,
      marketClickPrice:    Number(p.market_click_price)    || null,
      ourCartPrice:        Number(p.our_cart_price)        || null,
      marketCartPrice:     Number(p.market_cart_price)     || null,
      ourPurchasePrice:    Number(p.our_purchase_price)    || null,
      marketPurchasePrice: Number(p.market_purchase_price) || null,
    }));

    return NextResponse.json({ data: result });

  } catch (err) {
    console.error('trends route error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// ── BUILD ROW (monthly) ───────────────────────────────────────────────────────

function buildMonthRow(p: MonthAgg) {
  return {
    dateKey:      p.dateKey,
    endDate:      p.endDateVal,
    periodNumber: p.periodNumber,
    year:         p.year,
    searchVolume:      p.searchVolume,
    ourImpressions:    p.ourImpressions,
    marketImpressions: p.marketImpressions,
    ourClicks:         p.ourClicks,
    marketClicks:      p.marketClicks,
    ourCartAdds:       p.ourCartAdds,
    marketCartAdds:    p.marketCartAdds,
    ourPurchases:      p.ourPurchases,
    marketPurchases:   p.marketPurchases,
    impressionShare: p.marketImpressions > 0 ? (p.ourImpressions / p.marketImpressions) * 100 : 0,
    clickShare:      p.marketClicks      > 0 ? (p.ourClicks      / p.marketClicks)      * 100 : 0,
    cartAddShare:    p.marketCartAdds    > 0 ? (p.ourCartAdds    / p.marketCartAdds)    * 100 : 0,
    purchaseShare:   p.marketPurchases   > 0 ? (p.ourPurchases   / p.marketPurchases)   * 100 : 0,
    ourClickPrice:       p.ourClicks      > 0 ? p.ourClickPriceSum    / p.ourClicks      : null,
    marketClickPrice:    p.mktClickVol    > 0 ? p.mktClickPriceSum    / p.mktClickVol    : null,
    ourCartPrice:        p.ourCartAdds    > 0 ? p.ourCartPriceSum     / p.ourCartAdds    : null,
    marketCartPrice:     p.mktCartVol     > 0 ? p.mktCartPriceSum     / p.mktCartVol     : null,
    ourPurchasePrice:    p.ourPurchases   > 0 ? p.ourPurchasePriceSum / p.ourPurchases   : null,
    marketPurchasePrice: p.mktPurchaseVol > 0 ? p.mktPurchasePriceSum / p.mktPurchaseVol : null,
  };
}