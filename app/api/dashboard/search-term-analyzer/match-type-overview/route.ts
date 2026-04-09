import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function shiftDate(d: string, days: number) {
  const dt = new Date(d); dt.setDate(dt.getDate()-days); return dt.toISOString().split('T')[0];
}
function shiftMonth(d: string, months: number) {
  const dt = new Date(d); dt.setMonth(dt.getMonth()-months); return dt.toISOString().split('T')[0];
}

type Agg = { impressions:number; clicks:number; orders:number; spend:number; sales:number };
const mk = (): Agg => ({ impressions:0, clicks:0, orders:0, spend:0, sales:0 });
const add = (a: Agg, r: Record<string,unknown>) => {
  a.impressions += Number(r.impressions)  || 0;
  a.clicks      += Number(r.clicks)       || 0;
  a.orders      += Number(r.total_orders) || 0;
  a.spend       += Number(r.spend)        || 0;
  a.sales       += Number(r.total_sales)  || 0;
};
const kpis = (a: Agg) => ({
  ...a,
  ctr:  a.impressions>0?(a.clicks/a.impressions)*100:0,
  cvr:  a.clicks>0?(a.orders/a.clicks)*100:0,
  cpc:  a.clicks>0?a.spend/a.clicks:0,
  acos: a.sales>0?(a.spend/a.sales)*100:0,
  roas: a.spend>0?a.sales/a.spend:0,
});
const pct = (a:number,b:number) => b?((a-b)/Math.abs(b))*100:null;
const pp  = (a:number,b:number) => a-b;

function withDeltas(curr: Agg, prev: Agg|null, tSpend: number, tSales: number) {
  const ck=kpis(curr); const pk=prev?kpis(prev):null;
  return {
    ...ck,
    pctSpend: tSpend>0?(curr.spend/tSpend)*100:0,
    pctSales: tSales>0?(curr.sales/tSales)*100:0,
    impDelta:   pk?pct(ck.impressions,pk.impressions):null,
    clkDelta:   pk?pct(ck.clicks,pk.clicks):null,
    ctrDelta:   pk?pp(ck.ctr,pk.ctr):null,
    ordDelta:   pk?pct(ck.orders,pk.orders):null,
    cvrDelta:   pk?pp(ck.cvr,pk.cvr):null,
    cpcDelta:   pk?pct(ck.cpc,pk.cpc):null,
    spendDelta: pk?pct(ck.spend,pk.spend):null,
    salesDelta: pk?pct(ck.sales,pk.sales):null,
    acosDelta:  pk?pp(ck.acos,pk.acos):null,
    roasDelta:  pk?pp(ck.roas,pk.roas):null,
  };
}

export async function POST(req: NextRequest) {
  try {
    const { brands, families, startDate, endDate, mode, adType } = await req.json();
    if (!brands?.length && !families?.length) return NextResponse.json({ data:[] });

    const isMonthly = mode==='monthly';
    const table     = isMonthly ? 'ad_search_terms_monthly' : 'ad_search_terms_weekly';
    const dateField = isMonthly ? 'month_start_date' : 'week_start_date';
    const prevStart = isMonthly ? shiftMonth(startDate,1) : shiftDate(startDate,7);
    const prevEnd   = isMonthly ? shiftMonth(endDate,1)   : shiftDate(endDate,7);

    const brandFilter  = brands?.length  > 0 ? brands  : null;
    const familyFilter = families?.length > 0 ? families : null;

    const buildQ = (s: string, e: string) => {
      let q = supabase.from(table)
        .select(`${dateField}, ad_type, final_match_type, impressions, clicks, spend, total_sales, total_orders`)
        .gte(dateField,s).lte(dateField,e);
      if (brandFilter)     q = q.in('brand_name', brandFilter);
      if (familyFilter)    q = q.in('family_name', familyFilter);
      if (adType==='sp')   q = q.eq('ad_type','SP');
      if (adType==='sb')   q = q.eq('ad_type','SB');
      return q;
    };

    const { data: currRows, error } = await buildQ(startDate, endDate);
    if (error) throw error;
    if (!currRows?.length) return NextResponse.json({ data:[] });
    const { data: prevRows } = await buildQ(prevStart, prevEnd);

    type AdMap = Map<string,{ agg:Agg; matches:Map<string,Agg> }>;
    const buildMap = (rows: Record<string,unknown>[]): AdMap => {
      const m: AdMap = new Map();
      for (const r of rows) {
        const ak=String(r.ad_type??'SP').toUpperCase();
        const mtk=String(r.final_match_type??'Unknown');
        if (!m.has(ak)) m.set(ak,{ agg:mk(), matches:new Map() });
        const ae=m.get(ak)!; add(ae.agg,r);
        if (!ae.matches.has(mtk)) ae.matches.set(mtk,mk());
        add(ae.matches.get(mtk)!,r);
      }
      return m;
    };

    const currMap=buildMap(currRows as Record<string,unknown>[]);
    const prevMap=buildMap((prevRows??[]) as Record<string,unknown>[]);
    const totalCurr=mk(); for(const r of currRows as Record<string,unknown>[]) add(totalCurr,r);
    const totalPrev=mk(); for(const r of (prevRows??[]) as Record<string,unknown>[]) add(totalPrev,r);

    const data = Array.from(currMap.entries())
      .map(([adTypeName,ae]) => {
        const pae=prevMap.get(adTypeName);
        const matchTypes = Array.from(ae.matches.entries())
          .map(([matchType,ma]) => ({
            matchType,
            ...withDeltas(ma, pae?.matches.get(matchType)??null, ae.agg.spend, ae.agg.sales),
          }))
          .sort((a,b)=>b.spend-a.spend);
        return { adType:adTypeName, ...withDeltas(ae.agg,pae?.agg??null,totalCurr.spend,totalCurr.sales), matchTypes };
      })
      .sort((a,b)=>b.spend-a.spend);

    const total = { ...withDeltas(totalCurr,totalPrev.spend>0?totalPrev:null,totalCurr.spend,totalCurr.sales), pctSpend:100, pctSales:100 };
    return NextResponse.json({ data, total });
  } catch(err) {
    console.error('sta mt-overview error:', err);
    return NextResponse.json({ error:String(err) }, { status:500 });
  }
}