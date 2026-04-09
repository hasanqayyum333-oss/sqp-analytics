import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface PeriodAgg {
  periodNumber: number; year: number; searchVolume: number;
  ourImpressions: number; marketImpressions: number;
  ourClicks: number; marketClicks: number;
  ourCartAdds: number; marketCartAdds: number;
  ourPurchases: number; marketPurchases: number;
  ourClickPriceSum: number; mktClickPriceSum: number; mktClickVol: number;
  ourCartPriceSum: number; mktCartPriceSum: number; mktCartVol: number;
  ourPurchasePriceSum: number; mktPurchasePriceSum: number; mktPurchaseVol: number;
}

interface MonthlyRow {
  month_start_date: string; month_end_date: string; month_number: number; year: number;
  search_term: string; child_asin: string; search_volume: number | null;
  impressions_asin: number | null; impressions_total: number | null;
  clicks_asin: number | null; clicks_total: number | null;
  cart_adds_asin: number | null; cart_adds_total: number | null;
  purchases_asin: number | null; purchases_total: number | null;
  clicks_asin_price_median: number | null; clicks_price_median: number | null;
  cart_adds_asin_price_median: number | null; cart_adds_price_median: number | null;
  purchases_asin_price_median: number | null; purchases_price_median: number | null;
}

export interface PeriodResult {
  year: number; searchVolume: number;
  ourImpressions: number; marketImpressions: number; impressionShare: number;
  ourClicks: number; marketClicks: number; clickShare: number;
  ourCartAdds: number; marketCartAdds: number; cartAddShare: number;
  ourPurchases: number; marketPurchases: number; purchaseShare: number;
  ourClickPrice: number | null; marketClickPrice: number | null;
  ourCartPrice: number | null; marketCartPrice: number | null;
  ourPurchasePrice: number | null; marketPurchasePrice: number | null;
}

export interface YoYRow { periodNumber: number; ty: PeriodResult | null; ly: PeriodResult | null; }

function buildResult(p: PeriodAgg): PeriodResult {
  return {
    year: p.year, searchVolume: p.searchVolume,
    ourImpressions: p.ourImpressions, marketImpressions: p.marketImpressions,
    impressionShare: p.marketImpressions > 0 ? (p.ourImpressions / p.marketImpressions) * 100 : 0,
    ourClicks: p.ourClicks, marketClicks: p.marketClicks,
    clickShare: p.marketClicks > 0 ? (p.ourClicks / p.marketClicks) * 100 : 0,
    ourCartAdds: p.ourCartAdds, marketCartAdds: p.marketCartAdds,
    cartAddShare: p.marketCartAdds > 0 ? (p.ourCartAdds / p.marketCartAdds) * 100 : 0,
    ourPurchases: p.ourPurchases, marketPurchases: p.marketPurchases,
    purchaseShare: p.marketPurchases > 0 ? (p.ourPurchases / p.marketPurchases) * 100 : 0,
    ourClickPrice:       p.ourClicks      > 0 ? p.ourClickPriceSum    / p.ourClicks      : null,
    marketClickPrice:    p.mktClickVol    > 0 ? p.mktClickPriceSum    / p.mktClickVol    : null,
    ourCartPrice:        p.ourCartAdds    > 0 ? p.ourCartPriceSum     / p.ourCartAdds    : null,
    marketCartPrice:     p.mktCartVol     > 0 ? p.mktCartPriceSum     / p.mktCartVol     : null,
    ourPurchasePrice:    p.ourPurchases   > 0 ? p.ourPurchasePriceSum / p.ourPurchases   : null,
    marketPurchasePrice: p.mktPurchaseVol > 0 ? p.mktPurchasePriceSum / p.mktPurchaseVol : null,
  };
}

function emptyAgg(periodNumber: number, year: number): PeriodAgg {
  return {
    periodNumber, year, searchVolume: 0,
    ourImpressions: 0, marketImpressions: 0, ourClicks: 0, marketClicks: 0,
    ourCartAdds: 0, marketCartAdds: 0, ourPurchases: 0, marketPurchases: 0,
    ourClickPriceSum: 0, mktClickPriceSum: 0, mktClickVol: 0,
    ourCartPriceSum: 0, mktCartPriceSum: 0, mktCartVol: 0,
    ourPurchasePriceSum: 0, mktPurchasePriceSum: 0, mktPurchaseVol: 0,
  };
}

// Go back 6 days from Jan 1 so W1 (which can start Dec 26) is included
function yearDateRange(year: number): { start: string; end: string } {
  const today  = new Date();
  const jan1   = new Date(Date.UTC(year, 0, 1));
  jan1.setUTCDate(jan1.getUTCDate() - 6);
  const start  = jan1.toISOString().split('T')[0];
  const end    = year === today.getUTCFullYear() ? today.toISOString().split('T')[0] : `${year}-12-31`;
  return { start, end };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { asins, families, brands, mode } = body;
    const kwMode:        string      = body.kwMode        ?? 'both';
    const singleKeyword: string|null = body.singleKeyword ?? null;
    // Accept explicit tyYear/lyYear OR fall back to year / year-1
    const tyYear = Number(body.tyYear ?? body.year ?? new Date().getFullYear());
    const lyYear = Number(body.lyYear ?? (tyYear - 1));
    const isMonthly = mode === 'monthly';

    const hasFilter = (asins?.length > 0) || (families?.length > 0) || (brands?.length > 0);
    if (!hasFilter) return NextResponse.json({ data: [], requiresFilter: true });

    // Resolve ASINs
    let relevantAsins: string[] = asins?.length > 0 ? asins : [];
    if (relevantAsins.length === 0) {
      let q = supabase.from('product_mapping').select('child_asin, family_name');
      if (families?.length > 0) q = q.in('family_name', families);
      else if (brands?.length > 0) q = q.in('brand_name', brands);
      const { data } = await q;
      relevantAsins = (data ?? []).map((r: any) => r.child_asin);
    }
    if (relevantAsins.length === 0) return NextResponse.json({ data: [], tyYear, lyYear });

    // Get families
    const { data: asinData } = await supabase.from('product_mapping').select('child_asin, family_name').in('child_asin', relevantAsins);
    const asinFamilyMap: Record<string, string> = {};
    for (const r of (asinData ?? [])) asinFamilyMap[r.child_asin] = r.family_name;
    const relevantFamilies = [...new Set(Object.values(asinFamilyMap))];

    // Resolve keywords
    let genericKeywords: string[] | null = null;
    let brandedKeywords: string[] | null = null;

    if (kwMode === 'non-branded' || kwMode === 'both') {
      const { data } = await supabase.from('keyword_tracker').select('keyword').in('family_name', relevantFamilies);
      const set = new Set<string>();
      for (const r of (data ?? [])) set.add(r.keyword.toLowerCase().trim());
      genericKeywords = set.size > 0 ? Array.from(set) : null;
    }

    // ── MONTHLY PATH ─────────────────────────────────────────────────────────
    if (isMonthly) {
      let kwQuery = supabase.from('keyword_tracker').select('keyword').in('family_name', relevantFamilies);
      if (kwMode === 'non-branded') kwQuery = (kwQuery as any).eq('is_branded', false);
      if (kwMode === 'branded')     kwQuery = (kwQuery as any).eq('is_branded', true);
      const { data: trackedData } = await kwQuery;
      const kwSet = new Set<string>();
      for (const r of (trackedData ?? [])) kwSet.add(r.keyword.toLowerCase().trim());
      let monthlyKeywords = kwSet.size > 0 ? Array.from(kwSet) : null;
      if (singleKeyword) monthlyKeywords = [singleKeyword.toLowerCase().trim()];
      if (!monthlyKeywords?.length) return NextResponse.json({ data: [], tyYear, lyYear });

      const selectCols = ['month_start_date','month_end_date','month_number','year','search_term','child_asin','search_volume','impressions_asin','impressions_total','clicks_asin','clicks_total','cart_adds_asin','cart_adds_total','purchases_asin','purchases_total','clicks_asin_price_median','clicks_price_median','cart_adds_asin_price_median','cart_adds_price_median','purchases_asin_price_median','purchases_price_median'].join(',');

      const { data: rawData, error } = await supabase.from('sqp_monthly').select(selectCols)
        .in('child_asin', relevantAsins).in('year', [tyYear, lyYear])
        .in('search_term', monthlyKeywords).order('month_start_date');
      if (error) throw error;
      if (!rawData?.length) return NextResponse.json({ data: [], tyYear, lyYear });

      const rows = rawData as unknown as MonthlyRow[];
      const aggMap = new Map<string, PeriodAgg>();
      const termSeen = new Set<string>();

      for (const row of rows) {
        const key = `${row.year}-${row.month_number}`;
        const termKey = `${row.search_term}|${row.year}|${row.month_number}`;
        if (!aggMap.has(key)) aggMap.set(key, emptyAgg(row.month_number, row.year));
        const agg = aggMap.get(key)!;
        if (!termSeen.has(termKey)) {
          termSeen.add(termKey);
          agg.searchVolume += Number(row.search_volume) || 0;
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
        agg.ourImpressions      += Number(row.impressions_asin)  || 0;
        agg.ourClicks           += Number(row.clicks_asin)       || 0;
        agg.ourCartAdds         += Number(row.cart_adds_asin)    || 0;
        agg.ourPurchases        += Number(row.purchases_asin)    || 0;
        agg.ourClickPriceSum    += (Number(row.clicks_asin_price_median)    || 0) * (Number(row.clicks_asin)    || 0);
        agg.ourCartPriceSum     += (Number(row.cart_adds_asin_price_median) || 0) * (Number(row.cart_adds_asin) || 0);
        agg.ourPurchasePriceSum += (Number(row.purchases_asin_price_median) || 0) * (Number(row.purchases_asin) || 0);
      }

      const tyMap = new Map<number, PeriodAgg>();
      const lyMap = new Map<number, PeriodAgg>();
      for (const [key, agg] of aggMap) {
        const [yearStr, pnStr] = key.split('-');
        const y = Number(yearStr); const pn = Number(pnStr);
        if (y === tyYear) tyMap.set(pn, agg);
        if (y === lyYear) lyMap.set(pn, agg);
      }
      const allPeriods = [...new Set([...tyMap.keys(), ...lyMap.keys()])].sort((a, b) => a - b);
      const result: YoYRow[] = allPeriods.map(pn => ({
        periodNumber: pn,
        ty: tyMap.has(pn) ? buildResult(tyMap.get(pn)!) : null,
        ly: lyMap.has(pn) ? buildResult(lyMap.get(pn)!) : null,
      }));
      return NextResponse.json({ data: result, tyYear, lyYear });
    }

    // ── WEEKLY PATH ───────────────────────────────────────────────────────────
    if (kwMode === 'branded' || kwMode === 'both') {
      const { start: tyS, end: tyE } = yearDateRange(tyYear);
      const { start: lyS, end: lyE } = yearDateRange(lyYear);
      const [tyBr, lyBr] = await Promise.all([
        supabase.from('sqp_weekly').select('search_term').in('child_asin', relevantAsins).gte('week_start_date', tyS).lte('week_start_date', tyE).eq('is_branded', true),
        supabase.from('sqp_weekly').select('search_term').in('child_asin', relevantAsins).gte('week_start_date', lyS).lte('week_start_date', lyE).eq('is_branded', true),
      ]);
      const bSet = new Set<string>([
        ...(tyBr.data ?? []).map((r: any) => r.search_term.toLowerCase().trim()),
        ...(lyBr.data ?? []).map((r: any) => r.search_term.toLowerCase().trim()),
      ]);
      brandedKeywords = bSet.size > 0 ? Array.from(bSet) : null;
    }

    let finalKeywords: string[] | null = null;
    if      (kwMode === 'non-branded') finalKeywords = genericKeywords;
    else if (kwMode === 'branded')     finalKeywords = brandedKeywords;
    else {
      const merged = new Set<string>([...(genericKeywords ?? []), ...(brandedKeywords ?? [])]);
      finalKeywords = merged.size > 0 ? Array.from(merged) : null;
    }
    if (singleKeyword) finalKeywords = [singleKeyword.toLowerCase().trim()];

    const { start: tyStart, end: tyEnd } = yearDateRange(tyYear);
    const { start: lyStart, end: lyEnd } = yearDateRange(lyYear);

    const [tyResp, lyResp] = await Promise.all([
      supabase.rpc('get_trends_aggregated', { p_asins: relevantAsins, p_start_date: tyStart, p_end_date: tyEnd, p_keywords: finalKeywords }),
      supabase.rpc('get_trends_aggregated', { p_asins: relevantAsins, p_start_date: lyStart, p_end_date: lyEnd, p_keywords: finalKeywords }),
    ]);
    if (tyResp.error) throw tyResp.error;
    if (lyResp.error) throw lyResp.error;

    const parseRpc = (rows: any[]): Map<number, PeriodAgg> => {
      const map = new Map<number, PeriodAgg>();
      for (const p of (rows ?? [])) {
        const agg = emptyAgg(p.period_number, p.year);
        agg.searchVolume = Number(p.search_volume);
        agg.ourImpressions = Number(p.our_impressions); agg.marketImpressions = Number(p.market_impressions);
        agg.ourClicks = Number(p.our_clicks); agg.marketClicks = Number(p.market_clicks);
        agg.ourCartAdds = Number(p.our_cart_adds); agg.marketCartAdds = Number(p.market_cart_adds);
        agg.ourPurchases = Number(p.our_purchases); agg.marketPurchases = Number(p.market_purchases);
        agg.ourClickPriceSum    = Number(p.our_click_price)       * Number(p.our_clicks);
        agg.mktClickPriceSum    = Number(p.market_click_price)    * Number(p.market_clicks);
        agg.mktClickVol         = Number(p.market_clicks);
        agg.ourCartPriceSum     = Number(p.our_cart_price)        * Number(p.our_cart_adds);
        agg.mktCartPriceSum     = Number(p.market_cart_price)     * Number(p.market_cart_adds);
        agg.mktCartVol          = Number(p.market_cart_adds);
        agg.ourPurchasePriceSum = Number(p.our_purchase_price)    * Number(p.our_purchases);
        agg.mktPurchasePriceSum = Number(p.market_purchase_price) * Number(p.market_purchases);
        agg.mktPurchaseVol      = Number(p.market_purchases);
        map.set(p.period_number, agg);
      }
      return map;
    };

    const tyMap = parseRpc(tyResp.data ?? []);
    const lyMap = parseRpc(lyResp.data ?? []);
    const allPeriods = [...new Set([...tyMap.keys(), ...lyMap.keys()])].sort((a, b) => a - b);
    const result: YoYRow[] = allPeriods.map(pn => ({
      periodNumber: pn,
      ty: tyMap.has(pn) ? buildResult(tyMap.get(pn)!) : null,
      ly: lyMap.has(pn) ? buildResult(lyMap.get(pn)!) : null,
    }));
    return NextResponse.json({ data: result, tyYear, lyYear });

  } catch (err) {
    console.error('yoy route error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}