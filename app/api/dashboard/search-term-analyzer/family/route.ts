import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { term, startDate, endDate, mode, adType } = await req.json();
    if (!term) return NextResponse.json({ data: [] });

    const isMonthly = mode === 'monthly';
    const table     = isMonthly ? 'ad_search_terms_monthly' : 'ad_search_terms_weekly';
    const dateField = isMonthly ? 'month_start_date' : 'week_start_date';

    const sd = (d: string, days: number) => { const dt=new Date(d); dt.setDate(dt.getDate()-days); return dt.toISOString().split('T')[0]; };
    const sm = (d: string, m: number)    => { const dt=new Date(d); dt.setMonth(dt.getMonth()-m);  return dt.toISOString().split('T')[0]; };
    const prevStart = isMonthly ? sm(startDate,1) : sd(startDate,7);
    const prevEnd   = isMonthly ? sm(endDate,1)   : sd(endDate,7);

    const buildQ = (s: string, e: string) => {
      let q = supabase.from(table)
        .select(`${dateField}, family_name, ad_type, final_match_type, campaign_name, impressions, clicks, spend, total_sales, total_orders`)
        .gte(dateField, s).lte(dateField, e)
        .ilike('customer_search_term', term.trim().toLowerCase());
      if (adType === 'sp') q = q.eq('ad_type', 'SP');
      if (adType === 'sb') q = q.eq('ad_type', 'SB');
      return q;
    };

    const { data: currRows, error } = await buildQ(startDate, endDate);
    if (error) throw error;
    if (!currRows?.length) return NextResponse.json({ data: [] });
    const { data: prevRows } = await buildQ(prevStart, prevEnd);

    type Agg = { imp: number; clk: number; spend: number; sales: number; ord: number };
    const mk = (): Agg => ({ imp:0, clk:0, spend:0, sales:0, ord:0 });
    const add = (a: Agg, r: Record<string,unknown>) => {
      a.imp   += Number(r.impressions)  || 0;
      a.clk   += Number(r.clicks)       || 0;
      a.spend += Number(r.spend)        || 0;
      a.sales += Number(r.total_sales)  || 0;
      a.ord   += Number(r.total_orders) || 0;
    };
    const kpis = (a: Agg) => ({
      impressions: a.imp,
      clicks:      a.clk,
      orders:      a.ord,
      spend:       a.spend,
      sales:       a.sales,
      ctr:  a.imp   > 0 ? (a.clk/a.imp)*100   : 0,
      cvr:  a.clk   > 0 ? (a.ord/a.clk)*100   : 0,
      cpc:  a.clk   > 0 ?  a.spend/a.clk      : 0,
      acos: a.sales > 0 ? (a.spend/a.sales)*100: 0,
      roas: a.spend > 0 ?  a.sales/a.spend     : 0,
    });
    const pct = (a:number,b:number) => b?((a-b)/Math.abs(b))*100:null;
    const pp  = (a:number,b:number) => a-b;

    // 4-level map: family → adType → matchType → campaign
    type CampMap  = Map<string, Agg>;
    type MtMap    = Map<string, { agg: Agg; camps: CampMap }>;
    type AtMap    = Map<string, { agg: Agg; matches: MtMap }>;
    type FamMap   = Map<string, { agg: Agg; adTypes: AtMap }>;

    const buildMap = (rows: Record<string,unknown>[]): FamMap => {
      const fm: FamMap = new Map();
      for (const r of rows) {
        const fk = String(r.family_name ?? 'Unknown');
        const ak = String(r.ad_type ?? 'SP').toUpperCase();
        const mk2 = String(r.final_match_type ?? 'Unknown');
        const ck = String(r.campaign_name ?? 'Unknown Campaign');
        if (!fm.has(fk)) fm.set(fk, { agg:mk(), adTypes:new Map() });
        const fe=fm.get(fk)!; add(fe.agg,r);
        if (!fe.adTypes.has(ak)) fe.adTypes.set(ak,{agg:mk(),matches:new Map()});
        const ae=fe.adTypes.get(ak)!; add(ae.agg,r);
        if (!ae.matches.has(mk2)) ae.matches.set(mk2,{agg:mk(),camps:new Map()});
        const me=ae.matches.get(mk2)!; add(me.agg,r);
        if (!me.camps.has(ck)) me.camps.set(ck,mk());
        add(me.camps.get(ck)!,r);
      }
      return fm;
    };

    const currMap = buildMap(currRows as Record<string,unknown>[]);
    const prevMap = buildMap((prevRows??[]) as Record<string,unknown>[]);

    const totalCurr=mk(); for(const r of currRows as Record<string,unknown>[]) add(totalCurr,r);
    const totalPrev=mk(); for(const r of (prevRows??[]) as Record<string,unknown>[]) add(totalPrev,r);

    const wd = (curr:Agg, prev:Agg|null, ts:number, tsa:number) => {
      const ck=kpis(curr); const pk=prev?kpis(prev):null;
      return { ...ck,
        pctSpend: ts>0?(curr.spend/ts)*100:0,
        pctSales: tsa>0?(curr.sales/tsa)*100:0,
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
    };

    const data = Array.from(currMap.entries())
      .map(([familyName,fe]) => {
        const pfe=prevMap.get(familyName);
        const adTypes = Array.from(fe.adTypes.entries())
          .map(([adType2,ae]) => {
            const pae=pfe?.adTypes.get(adType2);
            const matchTypes = Array.from(ae.matches.entries())
              .map(([matchType,me]) => {
                const pme=pae?.matches.get(matchType);
                const campaigns = Array.from(me.camps.entries())
                  .map(([campName,ca]) => ({
                    campaignName: campName,
                    ...wd(ca, pme?.camps.get(campName)??null, me.agg.spend, me.agg.sales),
                  }))
                  .sort((a,b)=>b.spend-a.spend);
                return { matchType, ...wd(me.agg,pme?.agg??null,ae.agg.spend,ae.agg.sales), campaigns };
              })
              .sort((a,b)=>b.spend-a.spend);
            return { adType:adType2, ...wd(ae.agg,pae?.agg??null,fe.agg.spend,fe.agg.sales), matchTypes };
          })
          .sort((a,b)=>b.spend-a.spend);
        return { familyName, ...wd(fe.agg,pfe?.agg??null,totalCurr.spend,totalCurr.sales), adTypes };
      })
      .sort((a,b)=>b.spend-a.spend);

    const total = { ...wd(totalCurr,totalPrev.spend>0?totalPrev:null,totalCurr.spend,totalCurr.sales), pctSpend:100, pctSales:100 };
    return NextResponse.json({ data, total });

  } catch (err) {
    console.error('sta family route error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}