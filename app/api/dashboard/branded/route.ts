import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type SqpRow = Record<string, unknown>;
type AdsRow = Record<string, unknown>;

function aggSqpByTerm(rows: SqpRow[], dateCol: string, periodNum: string) {
  const map = new Map<string, {
    sv:number; mktImp:number; ourImp:number; mktClk:number; ourClk:number;
    mktCart:number; ourCart:number; mktPur:number; ourPur:number;
    mktRev:number; ourRev:number; periodNum:number; year:number; dateKey:string; dateEnd:string;
  }>();
  // search_volume is market-level (same value for all ASINs on the same term) — count once per term
  const svCounted = new Set<string>();
  for (const r of rows) {
    const term = String(r.search_term ?? '').toLowerCase().trim();
    if (!term) continue;
    if (!map.has(term)) map.set(term, {
      sv:0,mktImp:0,ourImp:0,mktClk:0,ourClk:0,mktCart:0,ourCart:0,mktPur:0,ourPur:0,mktRev:0,ourRev:0,
      periodNum:Number(r[periodNum]), year:Number(r.year), dateKey:String(r[dateCol]),
      dateEnd:String(r['week_end_date'] ?? r['month_end_date'] ?? ''),
    });
    const a = map.get(term)!;
    if (!svCounted.has(term)) {
      a.sv += Number(r.search_volume) || 0;
      svCounted.add(term);
    }
    a.mktImp  += Number(r.impressions_total)          || 0;
    a.ourImp  += Number(r.impressions_asin)           || 0;
    a.mktClk  += Number(r.clicks_total)               || 0;
    a.ourClk  += Number(r.clicks_asin)                || 0;
    a.mktCart += Number(r.cart_adds_total)            || 0;
    a.ourCart += Number(r.cart_adds_asin)             || 0;
    a.mktPur  += Number(r.purchases_total)            || 0;
    a.ourPur  += Number(r.purchases_asin)             || 0;
    a.mktRev  += (Number(r.purchases_price_median)||0)      * (Number(r.purchases_total)||0);
    a.ourRev  += (Number(r.purchases_asin_price_median)||0) * (Number(r.purchases_asin)||0);
  }
  return map;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { brand, families, mode, type } = body;
    const isMonthly = mode === 'monthly';
    const sqpTable  = isMonthly ? 'sqp_monthly'             : 'sqp_weekly';
    const adsTable  = isMonthly ? 'ad_search_terms_monthly' : 'ad_search_terms_weekly';
    const dateCol   = isMonthly ? 'month_start_date'        : 'week_start_date';
    const dateEnd   = isMonthly ? 'month_end_date'          : 'week_end_date';
    const periodNum = isMonthly ? 'month_number'            : 'week_number';

    // ── DEBUG ─────────────────────────────────────────────────────────────────
    if (type === 'debug') {
      const { count: c1 } = await supabase.from(sqpTable)
        .select('*', { count: 'exact', head: true }).eq('brand_name', brand).eq('is_branded', true);
      const { data: d2 } = await supabase.from(sqpTable).select(dateCol)
        .eq('brand_name', brand).eq('is_branded', true)
        .order(dateCol, { ascending: false }).limit(1);
      const latestD = d2?.[0] ? (d2[0] as Record<string,unknown>)[dateCol] : null;
      const { count: c3 } = await supabase.from(sqpTable)
        .select('*', { count: 'exact', head: true })
        .eq('brand_name', brand).eq('is_branded', true).eq(dateCol, latestD ?? '');
      return NextResponse.json({ brand, totalBrandedRows: c1, latestBrandedDate: latestD, rowsAtLatestDate: c3 });
    }

    // ── DEFAULTS ──────────────────────────────────────────────────────────────
    if (type === 'defaults') {
      const { data: latestRows } = await supabase.from(sqpTable)
        .select(dateCol).order(dateCol, { ascending: false }).limit(1);
      const latestDate = latestRows?.[0] ? (latestRows[0] as Record<string,unknown>)[dateCol] as string : null;
      const { data: brandRows } = await supabase.from(sqpTable)
        .select('brand_name, purchases_asin').eq(dateCol, latestDate ?? '');
      const brandMap = new Map<string,number>();
      for (const r of (brandRows ?? []) as SqpRow[]) {
        const b = String(r.brand_name ?? '');
        brandMap.set(b, (brandMap.get(b) ?? 0) + (Number(r.purchases_asin)||0));
      }
      const bestBrand = [...brandMap.entries()].sort((a,b) => b[1]-a[1])[0]?.[0] ?? '';
      const { data: famRows } = await supabase.from(sqpTable)
        .select('family_name, purchases_asin').eq(dateCol, latestDate ?? '').eq('brand_name', bestBrand);
      const famMap = new Map<string,number>();
      for (const r of (famRows ?? []) as SqpRow[]) {
        const f = String(r.family_name ?? '');
        famMap.set(f, (famMap.get(f) ?? 0) + (Number(r.purchases_asin)||0));
      }
      const bestFamily = [...famMap.entries()].sort((a,b) => b[1]-a[1])[0]?.[0] ?? '';
      return NextResponse.json({ latestDate, bestBrand, bestFamily });
    }

    if (!brand) return NextResponse.json({ error: 'brand required' }, { status: 400 });
    const familyFilter = families?.length > 0 ? (families as string[]) : null;
    const startDate = (body as { startDate?: string }).startDate ?? null;

    // ── SHOW-DATA (popup) ─────────────────────────────────────────────────────
    if (type === 'show-data') {
      const { term, startDate: sdStart, endDate: sdEnd } = body as {
        term: string; startDate: string; endDate: string;
      };
      if (!term) return NextResponse.json({ error: 'term required' }, { status: 400 });
      const cols = ['search_term', dateCol, dateEnd, periodNum, 'year',
        'search_volume','impressions_total','impressions_asin',
        'clicks_total','clicks_asin','cart_adds_total','cart_adds_asin',
        'purchases_total','purchases_asin',
        'purchases_price_median','purchases_asin_price_median'].join(', ');
      let sqpQ = supabase.from(sqpTable).select(cols)
        .eq('brand_name', brand).eq('is_branded', true)
        .ilike('search_term', term.trim());
      if (familyFilter) sqpQ = sqpQ.in('family_name', familyFilter);
      if (sdStart) sqpQ = sqpQ.gte(dateCol, sdStart);
      if (sdEnd)   sqpQ = sqpQ.lte(dateCol, sdEnd);
      const { data: sqpRaw } = await sqpQ.order(dateCol, { ascending: false }).limit(5000);
      const sqpRows = (sqpRaw ?? []) as unknown as SqpRow[];

      type SdBkt = { periodNum:number; year:number; dateEnd:string;
        sv:number; mktImp:number; ourImp:number; mktClk:number; ourClk:number;
        mktCart:number; ourCart:number; mktPur:number; ourPur:number; };
      const sqpMap = new Map<string, SdBkt>();
      for (const r of sqpRows) {
        const dk = String(r[dateCol]);
        if (!sqpMap.has(dk)) sqpMap.set(dk, {
          periodNum:Number(r[periodNum]), year:Number(r.year),
          dateEnd:String(r[dateEnd] ?? ''),
          sv:0,mktImp:0,ourImp:0,mktClk:0,ourClk:0,mktCart:0,ourCart:0,mktPur:0,ourPur:0,
        });
        const a = sqpMap.get(dk)!;
        a.sv      += Number(r.search_volume)     || 0;
        a.mktImp  += Number(r.impressions_total) || 0;
        a.ourImp  += Number(r.impressions_asin)  || 0;
        a.mktClk  += Number(r.clicks_total)      || 0;
        a.ourClk  += Number(r.clicks_asin)       || 0;
        a.mktCart += Number(r.cart_adds_total)   || 0;
        a.ourCart += Number(r.cart_adds_asin)    || 0;
        a.mktPur  += Number(r.purchases_total)   || 0;
        a.ourPur  += Number(r.purchases_asin)    || 0;
      }

      type AdSdBkt = { imp:number; clk:number; spend:number; sales:number; orders:number; };
      const adsMap = new Map<string, AdSdBkt>();
      let adsQ = supabase.from(adsTable)
        .select([dateCol,'impressions','clicks','spend','total_sales','total_orders'].join(', '))
        .eq('brand_name', brand).ilike('customer_search_term', term.trim());
      if (sdStart) adsQ = adsQ.gte(dateCol, sdStart);
      if (sdEnd)   adsQ = adsQ.lte(dateCol, sdEnd);
      const { data: adsRaw } = await adsQ.order(dateCol, { ascending: false }).limit(5000);
      for (const r of (adsRaw ?? []) as unknown as AdsRow[]) {
        const dk = String((r as Record<string,unknown>)[dateCol]);
        if (!adsMap.has(dk)) adsMap.set(dk, {imp:0,clk:0,spend:0,sales:0,orders:0});
        const a = adsMap.get(dk)!;
        a.imp    += Number(r.impressions)  || 0;
        a.clk    += Number(r.clicks)       || 0;
        a.spend  += Number(r.spend)        || 0;
        a.sales  += Number(r.total_sales)  || 0;
        a.orders += Number(r.total_orders) || 0;
      }

      const allDates = [...new Set([...sqpMap.keys(), ...adsMap.keys()])].sort().reverse();
      const sh = (o:number,m:number) => m>0?(o/m)*100:0;
      const pct = (a:number,b:number) => b?((a-b)/Math.abs(b))*100:null;

      const data = allDates.map((dk, i) => {
        const s = sqpMap.get(dk);
        const a = adsMap.get(dk);
        const prevDk = allDates[i+1];
        const ps = prevDk ? sqpMap.get(prevDk) : null;
        const pa = prevDk ? adsMap.get(prevDk) : null;
        const impSh  = s ? sh(s.ourImp,  s.mktImp)  : 0;
        const clkSh  = s ? sh(s.ourClk,  s.mktClk)  : 0;
        const cartSh = s ? sh(s.ourCart, s.mktCart) : 0;
        const purSh  = s ? sh(s.ourPur,  s.mktPur)  : 0;
        const pImpSh  = ps ? sh(ps.ourImp,  ps.mktImp)  : null;
        const pClkSh  = ps ? sh(ps.ourClk,  ps.mktClk)  : null;
        const pCartSh = ps ? sh(ps.ourCart, ps.mktCart) : null;
        const pPurSh  = ps ? sh(ps.ourPur,  ps.mktPur)  : null;
        const acos  = a && a.sales>0 ? (a.spend/a.sales)*100 : null;
        const pacos = pa && pa.sales>0 ? (pa.spend/pa.sales)*100 : null;
        return {
          dateKey:dk, periodNumber:s?.periodNum??0, year:s?.year??0, dateEnd:s?.dateEnd??'',
          searchVolume:s?.sv??0, svDelta: ps ? pct(s?.sv??0, ps.sv) : null,
          impShare:impSh,   impDelta:  pImpSh  !== null ? pct(impSh,  pImpSh)  : null,
          clkShare:clkSh,   clkDelta:  pClkSh  !== null ? pct(clkSh,  pClkSh)  : null,
          cartShare:cartSh, cartDelta: pCartSh !== null ? pct(cartSh, pCartSh) : null,
          purShare:purSh,   purDelta:  pPurSh  !== null ? pct(purSh,  pPurSh)  : null,
          adsImp:a?.imp??null,    adsClk:a?.clk??null,
          adsOrders:a?.orders??null, adsSpend:a?.spend??null, adsSales:a?.sales??null, adsAcos:acos,
          adsImpDelta:  pa && a ? pct(a.imp,   pa.imp)   : null,
          adsClkDelta:  pa && a ? pct(a.clk,   pa.clk)   : null,
          adsOrdDelta:  pa && a ? pct(a.orders,pa.orders) : null,
          adsSpendDelta:pa && a ? pct(a.spend, pa.spend)  : null,
          adsSalesDelta:pa && a ? pct(a.sales, pa.sales)  : null,
          adsAcosDelta: (acos !== null && pacos !== null) ? pct(acos, pacos) : null,
        };
      });
      return NextResponse.json({ data });
    }

    // ── SECTION 1: use selected startDate, fallback to latest ─────────────────
    // Determine the target date for section 1
    let latestDate: string | null = null;
    if (startDate) {
      // Check if data exists for selected date
      let chkQ = supabase.from(sqpTable).select(dateCol)
        .eq('brand_name', brand).eq('is_branded', true).eq(dateCol, startDate);
      if (familyFilter) chkQ = chkQ.in('family_name', familyFilter);
      const { data: chkRows } = await chkQ.limit(1);
      if (chkRows?.length) latestDate = startDate;
    }
    if (!latestDate) {
      // Fallback: find the latest available date
      let s1LatestQ = supabase.from(sqpTable).select(dateCol)
        .eq('brand_name', brand).eq('is_branded', true);
      if (familyFilter) s1LatestQ = s1LatestQ.in('family_name', familyFilter);
      const { data: latestRowsS1 } = await s1LatestQ.order(dateCol, { ascending: false }).limit(1);
      latestDate = latestRowsS1?.[0]
        ? (latestRowsS1[0] as Record<string,unknown>)[dateCol] as string : null;
    }

    let section1: unknown[] = [];
    if (latestDate) {
      const s1Cols = ['search_term', dateCol, dateEnd, periodNum, 'year',
        'search_volume','impressions_total','impressions_asin','clicks_total','clicks_asin',
        'cart_adds_total','cart_adds_asin','purchases_total','purchases_asin',
        'purchases_price_median','purchases_asin_price_median'].join(', ');

      let s1Q = supabase.from(sqpTable).select(s1Cols)
        .eq('brand_name', brand).eq('is_branded', true).eq(dateCol, latestDate);
      if (familyFilter) s1Q = s1Q.in('family_name', familyFilter);
      const { data: sqpLatestRaw } = await s1Q.limit(10000);
      const sqpLatest = (sqpLatestRaw ?? []) as unknown as SqpRow[];

      let s1PrevQ = supabase.from(sqpTable).select(dateCol)
        .eq('brand_name', brand).eq('is_branded', true).lt(dateCol, latestDate);
      if (familyFilter) s1PrevQ = s1PrevQ.in('family_name', familyFilter);
      const { data: prevPeriodsRaw } = await s1PrevQ.order(dateCol, { ascending: false }).limit(1);
      const prevDate = prevPeriodsRaw?.[0]
        ? (prevPeriodsRaw[0] as Record<string,unknown>)[dateCol] as string : null;

      let prevSqp: SqpRow[] = [];
      if (prevDate) {
        let s1PrevDataQ = supabase.from(sqpTable)
          .select(['search_term', dateCol, 'search_volume',
            'impressions_total','impressions_asin','clicks_total','clicks_asin',
            'cart_adds_total','cart_adds_asin','purchases_total','purchases_asin',
            'purchases_price_median','purchases_asin_price_median'].join(', '))
          .eq('brand_name', brand).eq('is_branded', true).eq(dateCol, prevDate);
        if (familyFilter) s1PrevDataQ = s1PrevDataQ.in('family_name', familyFilter);
        const { data: sqpPrevRaw } = await s1PrevDataQ.limit(10000);
        prevSqp = (sqpPrevRaw ?? []) as unknown as SqpRow[];
      }

      const brandedTerms = new Set<string>();
      for (const r of sqpLatest)
        brandedTerms.add(String(r.search_term ?? '').toLowerCase().trim());

      let adsLatestQ = supabase.from(adsTable)
        .select('customer_search_term,impressions,clicks,ctr,spend,total_sales,total_orders,acos,roas,cpc')
        .eq('brand_name', brand).eq(dateCol, latestDate).limit(10000);
      if (familyFilter) adsLatestQ = adsLatestQ.in('family_name', familyFilter);
      const { data: adsLatestRaw } = await adsLatestQ;
      const adsLatest = (adsLatestRaw ?? []) as unknown as AdsRow[];

      let prevAds: AdsRow[] = [];
      if (prevDate) {
        let adsPrevQ = supabase.from(adsTable)
          .select('customer_search_term,impressions,clicks,spend,total_sales,total_orders')
          .eq('brand_name', brand).eq(dateCol, prevDate).limit(10000);
        if (familyFilter) adsPrevQ = adsPrevQ.in('family_name', familyFilter);
        const { data: adsPrevRaw } = await adsPrevQ;
        prevAds = (adsPrevRaw ?? []) as unknown as AdsRow[];
      }

      function aggAdsByTerm(rows: AdsRow[]) {
        const m = new Map<string,{imp:number;clk:number;spend:number;sales:number;orders:number}>();
        for (const r of rows) {
          const t = String(r.customer_search_term ?? '').toLowerCase().trim();
          if (!t || !brandedTerms.has(t)) continue;
          if (!m.has(t)) m.set(t, {imp:0,clk:0,spend:0,sales:0,orders:0});
          const a = m.get(t)!;
          a.imp    += Number(r.impressions)  || 0;
          a.clk    += Number(r.clicks)       || 0;
          a.spend  += Number(r.spend)        || 0;
          a.sales  += Number(r.total_sales)  || 0;
          a.orders += Number(r.total_orders) || 0;
        }
        return m;
      }

      const latestMap  = aggSqpByTerm(sqpLatest, dateCol, periodNum);
      const prevMap    = aggSqpByTerm(prevSqp, dateCol, periodNum);
      const adsMap     = aggAdsByTerm(adsLatest);
      const prevAdsMap = aggAdsByTerm(prevAds);
      const sh = (our:number, mkt:number) => mkt > 0 ? (our/mkt)*100 : 0;


      section1 = Array.from(latestMap.entries()).map(([term, a]) => {
        const p   = prevMap.get(term);
        const ads = adsMap.get(term);
        const pa  = prevAdsMap.get(term);
        return {
          searchTerm:term, periodNumber:a.periodNum, year:a.year, dateKey:a.dateKey, dateEnd:a.dateEnd,
          searchVolume:a.sv, prevSearchVolume:p?.sv??null,
          mktImp:a.mktImp, ourImp:a.ourImp, impShare:sh(a.ourImp,a.mktImp),
          mktClk:a.mktClk, ourClk:a.ourClk, clkShare:sh(a.ourClk,a.mktClk),
          mktCart:a.mktCart, ourCart:a.ourCart, cartShare:sh(a.ourCart,a.mktCart),
          mktPur:a.mktPur, ourPur:a.ourPur, purShare:sh(a.ourPur,a.mktPur),
          mktRev:a.mktRev, ourRev:a.ourRev, revShare:sh(a.ourRev,a.mktRev),
          prevImpShare:p?sh(p.ourImp,p.mktImp):null, prevClkShare:p?sh(p.ourClk,p.mktClk):null,
          prevCartShare:p?sh(p.ourCart,p.mktCart):null, prevPurShare:p?sh(p.ourPur,p.mktPur):null,
          prevRevShare:p?sh(p.ourRev,p.mktRev):null,
          prevMktImp:p?.mktImp??null, prevOurImp:p?.ourImp??null,
          prevMktClk:p?.mktClk??null, prevOurClk:p?.ourClk??null,
          prevMktCart:p?.mktCart??null, prevOurCart:p?.ourCart??null,
          prevMktPur:p?.mktPur??null, prevOurPur:p?.ourPur??null,
          prevMktRev:p?.mktRev??null, prevOurRev:p?.ourRev??null,
          adsImp:ads?.imp??null, adsClk:ads?.clk??null,
          adsCtr:ads&&ads.imp>0?(ads.clk/ads.imp)*100:null,
          adsOrders:ads?.orders??null,
          adsCvr:ads&&ads.clk>0?(ads.orders/ads.clk)*100:null,
          adsSpend:ads?.spend??null, adsSales:ads?.sales??null,
          adsAcos:ads&&ads.sales>0?(ads.spend/ads.sales)*100:null,
          prevAdsImp:pa?.imp??null, prevAdsClk:pa?.clk??null,
          prevAdsOrders:pa?.orders??null, prevAdsSpend:pa?.spend??null, prevAdsSales:pa?.sales??null,
        };
      }).sort((a,b) => (b.ourPur as number)-(a.ourPur as number));
    }

    // ── SECTIONS 2 & 3 ────────────────────────────────────────────────────────
    let asinQ = supabase.from('product_mapping').select('child_asin').eq('brand_name', brand);
    if (familyFilter) asinQ = asinQ.in('family_name', familyFilter);
    const { data: asinRows } = await asinQ;
    const asins = (asinRows ?? []).map((r:{child_asin:string}) => r.child_asin);

    if (!asins.length) return NextResponse.json({ section1, section2:[], section3:[] });

    const { data: allDatesRaw } = await supabase.from(sqpTable)
      .select(dateCol).in('child_asin', asins).order(dateCol, { ascending: false }).limit(5000);
    const uniqueDates = [...new Set((allDatesRaw ?? []).map(r =>
      (r as Record<string,unknown>)[dateCol] as string))]
      .sort().reverse().slice(0, 10);

    if (!uniqueDates.length) return NextResponse.json({ section1, section2:[], section3:[] });

    const { data: aggRowsRaw } = await supabase.from(sqpTable)
      .select([dateCol, periodNum, 'year','is_branded','search_term',
        'impressions_total','impressions_asin','clicks_total','clicks_asin',
        'cart_adds_total','cart_adds_asin','purchases_total','purchases_asin',
        'purchases_price_median','purchases_asin_price_median'].join(', '))
      .in('child_asin', asins).in(dateCol, uniqueDates);
    const aggRows = (aggRowsRaw ?? []) as unknown as SqpRow[];

    type Bucket = {
      periodNum:number; year:number;
      mktImp:number; ourImp:number; mktClk:number; ourClk:number;
      mktCart:number; ourCart:number; mktPur:number; ourPur:number;
      mktRev:number; ourRev:number; termSeen:Set<string>;
    };
    const periodMap = new Map<string,{br:Bucket;nb:Bucket}>();

    for (const r of aggRows) {
      const dk = String(r[dateCol]);
      if (!periodMap.has(dk)) {
        const empty = (): Bucket => ({
          periodNum:Number(r[periodNum]), year:Number(r.year),
          mktImp:0,ourImp:0,mktClk:0,ourClk:0,mktCart:0,ourCart:0,
          mktPur:0,ourPur:0,mktRev:0,ourRev:0, termSeen:new Set(),
        });
        periodMap.set(dk, { br:empty(), nb:empty() });
      }
      const bkt = r.is_branded ? periodMap.get(dk)!.br : periodMap.get(dk)!.nb;
      const tk  = String(r.search_term ?? '').toLowerCase().trim();
      if (!bkt.termSeen.has(tk)) {
        bkt.termSeen.add(tk);
        bkt.mktImp  += Number(r.impressions_total) || 0;
        bkt.mktClk  += Number(r.clicks_total)      || 0;
        bkt.mktCart += Number(r.cart_adds_total)   || 0;
        bkt.mktPur  += Number(r.purchases_total)   || 0;
        bkt.mktRev  += (Number(r.purchases_price_median)||0)*(Number(r.purchases_total)||0);
      }
      bkt.ourImp  += Number(r.impressions_asin) || 0;
      bkt.ourClk  += Number(r.clicks_asin)      || 0;
      bkt.ourCart += Number(r.cart_adds_asin)   || 0;
      bkt.ourPur  += Number(r.purchases_asin)   || 0;
      bkt.ourRev  += (Number(r.purchases_asin_price_median)||0)*(Number(r.purchases_asin)||0);
    }

    // Ads for sections 2 & 3 — same dates as SQP, use is_branded directly from ads table
    let adsAggQ = supabase.from(adsTable)
      .select([dateCol, 'is_branded', 'spend', 'total_sales'].join(', '))
      .eq('brand_name', brand).in(dateCol, uniqueDates);
    if (familyFilter) adsAggQ = adsAggQ.in('family_name', familyFilter);
    const { data: adsAggRaw } = await adsAggQ;
    const adsAgg = (adsAggRaw ?? []) as unknown as AdsRow[];

    type AdsBkt = {spend:number;sales:number};
    const adsMap2 = new Map<string,{br:AdsBkt;nb:AdsBkt}>();
    for (const r of adsAgg) {
      const dk = String((r as Record<string,unknown>)[dateCol]);
      if (!adsMap2.has(dk)) adsMap2.set(dk, {br:{spend:0,sales:0},nb:{spend:0,sales:0}});
      const isBranded = r.is_branded === true || r.is_branded === 'true' || r.is_branded === 1;
      const bkt = isBranded ? adsMap2.get(dk)!.br : adsMap2.get(dk)!.nb;
      bkt.spend += Number(r.spend)       || 0;
      bkt.sales += Number(r.total_sales) || 0;
    }

    const shFn = (our:number,mkt:number) => mkt>0?(our/mkt)*100:0;
    const periods = uniqueDates.map(dk => {
      const p=periodMap.get(dk);
      const br=p?.br; const nb=p?.nb;
      const ad=adsMap2.get(dk);
      const adbr=ad?.br; const adnb=ad?.nb;
      return {
        dateKey:dk, periodNumber:br?.periodNum??nb?.periodNum??0, year:br?.year??nb?.year??0,
        nb:{
          impShare:shFn(nb?.ourImp??0,nb?.mktImp??0), ourImp:nb?.ourImp??0, mktImp:nb?.mktImp??0,
          clkShare:shFn(nb?.ourClk??0,nb?.mktClk??0), ourClk:nb?.ourClk??0, mktClk:nb?.mktClk??0,
          cartShare:shFn(nb?.ourCart??0,nb?.mktCart??0), ourCart:nb?.ourCart??0, mktCart:nb?.mktCart??0,
          purShare:shFn(nb?.ourPur??0,nb?.mktPur??0), ourPur:nb?.ourPur??0, mktPur:nb?.mktPur??0,
          revShare:shFn(nb?.ourRev??0,nb?.mktRev??0), ourRev:nb?.ourRev??0, mktRev:nb?.mktRev??0,
        },
        br:{
          impShare:shFn(br?.ourImp??0,br?.mktImp??0), ourImp:br?.ourImp??0, mktImp:br?.mktImp??0,
          clkShare:shFn(br?.ourClk??0,br?.mktClk??0), ourClk:br?.ourClk??0, mktClk:br?.mktClk??0,
          cartShare:shFn(br?.ourCart??0,br?.mktCart??0), ourCart:br?.ourCart??0, mktCart:br?.mktCart??0,
          purShare:shFn(br?.ourPur??0,br?.mktPur??0), ourPur:br?.ourPur??0, mktPur:br?.mktPur??0,
          revShare:shFn(br?.ourRev??0,br?.mktRev??0), ourRev:br?.ourRev??0, mktRev:br?.mktRev??0,
        },
        s3:{
          nbImp:nb?.ourImp??0, brImp:br?.ourImp??0,
          nbClk:nb?.ourClk??0, brClk:br?.ourClk??0,
          nbCart:nb?.ourCart??0, brCart:br?.ourCart??0,
          nbPur:nb?.ourPur??0, brPur:br?.ourPur??0,
          nbRev:nb?.ourRev??0, brRev:br?.ourRev??0,
          nbSpend:adnb?.spend??0, brSpend:adbr?.spend??0,
          nbSales:adnb?.sales??0, brSales:adbr?.sales??0,
          nbAcos:adnb&&adnb.sales>0?(adnb.spend/adnb.sales)*100:0,
          brAcos:adbr&&adbr.sales>0?(adbr.spend/adbr.sales)*100:0,
        },
      };
    });

    return NextResponse.json({ section1, section2:periods, section3:periods });

  } catch (err) {
    console.error('branded route error:', err);
    return NextResponse.json({ error:String(err) }, { status:500 });
  }
}