import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type STARow = {
  term: string;
  impressions: number; clicks: number; ctr: number;
  orders: number; cvr: number; cpc: number;
  spend: number; sales: number; acos: number; roas: number;
  impDelta: number|null; clkDelta: number|null; ctrDelta: number|null;
  ordDelta: number|null; cvrDelta: number|null; cpcDelta: number|null;
  spendDelta: number|null; salesDelta: number|null;
  acosDelta: number|null; roasDelta: number|null;
};

// ── Date helpers ──────────────────────────────────────────────────────────────
function shiftDate(d: string, days: number) {
  const dt = new Date(d); dt.setDate(dt.getDate() - days);
  return dt.toISOString().split('T')[0];
}
function shiftMonth(d: string, months: number) {
  const dt = new Date(d); dt.setMonth(dt.getMonth() - months);
  return dt.toISOString().split('T')[0];
}

// Format a single date: "15 Mar 26"
function fmtDay(dateStr: string): string {
  const d   = new Date(dateStr);
  const day = d.getDate();
  const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
  const yr  = String(d.getFullYear()).slice(2);
  return `${day} ${mon} ${yr}`;
}

// Full week label: "W11/2026 — 15 Mar 26 to 21 Mar 26"
function fmtWeekLabel(startStr: string, endStr: string | null, weekNum: number | null): string {
  const yr    = new Date(startStr).getFullYear();
  const wPfx  = weekNum ? `W${weekNum}/${yr} — ` : '';
  const start = fmtDay(startStr);
  const end   = endStr ? ` to ${fmtDay(endStr)}` : '';
  return `${wPfx}${start}${end}`;
}

// Full month label: "Mar 2026"
function fmtMonthLabel(dateStr: string): string {
  const d   = new Date(dateStr);
  const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
  return `${mon} ${d.getFullYear()}`;
}

// ── KPI helpers ───────────────────────────────────────────────────────────────
function pct(a: number, b: number): number | null {
  if (!b) return null;
  return ((a - b) / Math.abs(b)) * 100;
}
function pp(a: number, b: number): number | null {
  return a - b;
}

function buildRow(curr: Record<string,number>, prev: Record<string,number>|null): STARow {
  const c = curr; const p = prev;
  const ctr   = c.impressions > 0 ? (c.clicks/c.impressions)*100 : 0;
  const cvr   = c.clicks > 0 ? (c.orders/c.clicks)*100 : 0;
  const cpc   = c.clicks > 0 ? c.spend/c.clicks : 0;
  const acos  = c.sales > 0 ? (c.spend/c.sales)*100 : 0;
  const roas  = c.spend > 0 ? c.sales/c.spend : 0;
  const pctr  = p && p.impressions>0 ? (p.clicks/p.impressions)*100 : 0;
  const pcvr  = p && p.clicks>0 ? (p.orders/p.clicks)*100 : 0;
  const pcpc  = p && p.clicks>0 ? p.spend/p.clicks : 0;
  const pacos = p && p.sales>0 ? (p.spend/p.sales)*100 : 0;
  const proas = p && p.spend>0 ? p.sales/p.spend : 0;
  return {
    term:'',
    impressions: c.impressions??0, clicks: c.clicks??0, ctr,
    orders: c.orders??0, cvr, cpc,
    spend: c.spend??0, sales: c.sales??0, acos, roas,
    impDelta:   p?pct(c.impressions,p.impressions):null,
    clkDelta:   p?pct(c.clicks,p.clicks):null,
    ctrDelta:   p?pp(ctr,pctr):null,
    ordDelta:   p?pct(c.orders,p.orders):null,
    cvrDelta:   p?pp(cvr,pcvr):null,
    cpcDelta:   p?pct(cpc,pcpc):null,
    spendDelta: p?pct(c.spend,p.spend):null,
    salesDelta: p?pct(c.sales,p.sales):null,
    acosDelta:  p?pp(acos,pacos):null,
    roasDelta:  p?pp(roas,proas):null,
  };
}

// ── GET: all date options + defaults ─────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const mode      = searchParams.get('mode') ?? 'weekly';
    const isMonthly = mode === 'monthly';
    const table     = isMonthly ? 'ad_search_terms_monthly' : 'ad_search_terms_weekly';
    const dateField = isMonthly ? 'month_start_date' : 'week_start_date';

    // ── Short-circuit: brand families lookup ──────────────────────────────────
    // Called when user changes brand — returns families from ad data (same source as STA)
    const brandParam = searchParams.get('brand');
    if (brandParam) {
      const { data: famRows } = await supabase.from(table)
        .select('family_name')
        .eq('brand_name', brandParam)
        .not('family_name', 'is', null)
        .limit(2000);
      const families = [...new Set(
        ((famRows ?? []) as { family_name: string }[]).map(r => r.family_name)
      )].filter(Boolean).sort();
      return NextResponse.json({ familiesForBrand: families });
    }

    // Run date + brand queries in parallel
    const selectFields = isMonthly
      ? `${dateField}, end_date`
      : `${dateField}, end_date, week_number`;

    const [{ data: allDateRows }, { data: allBrandRows }] = await Promise.all([
      supabase.from(table).select(selectFields).order(dateField, { ascending: false }).limit(2000),
      supabase.from(table).select('brand_name').order('brand_name').limit(2000),
    ]);

    // Build date options with full formatted labels — deduplicate by start date
    const seenDates = new Set<string>();
    const dateOptions: { value: string; label: string }[] = [];

    for (const r of ((allDateRows ?? []) as unknown) as Record<string,unknown>[]) {
      const val = String(r[dateField] ?? '');
      if (!val || seenDates.has(val)) continue;
      seenDates.add(val);

      const endStr = r.end_date ? String(r.end_date) : null;
      const wn     = isMonthly ? null : (r.week_number as number|null ?? null);
      const label  = isMonthly
        ? fmtMonthLabel(val)
        : fmtWeekLabel(val, endStr, wn);

      dateOptions.push({ value: val, label });
    }

    const latestDate = dateOptions[0]?.value ?? null;
    if (!latestDate) {
      return NextResponse.json({ latestDate:null, dateOptions:[], topBrand:null, topFamily:null, allBrands:[] });
    }

    const allBrands = [...new Set(
      ((allBrandRows??[]) as {brand_name:string}[]).map(r=>r.brand_name)
    )].filter(Boolean);

    // Top brand + top family in parallel
    const [{ data: brandRows }, ] = await Promise.all([
      supabase.from(table).select('brand_name, family_name, spend').eq(dateField, latestDate).limit(5000),
    ]);

    const brandSpend = new Map<string,number>();
    const famSpendPerBrand = new Map<string, Map<string,number>>();
    for (const r of ((brandRows??[]) as {brand_name:string;family_name:string;spend:number}[])) {
      const b = r.brand_name; const f = r.family_name; const s = Number(r.spend)||0;
      brandSpend.set(b, (brandSpend.get(b)??0)+s);
      if (!famSpendPerBrand.has(b)) famSpendPerBrand.set(b, new Map());
      famSpendPerBrand.get(b)!.set(f, (famSpendPerBrand.get(b)!.get(f)??0)+s);
    }
    let topBrand='', topBS=-1;
    for (const [b,s] of brandSpend) if(s>topBS){topBS=s;topBrand=b;}
    let topFamily='', topFS=-1;
    for (const [f,s] of (famSpendPerBrand.get(topBrand)??new Map())) if(s>topFS){topFS=s;topFamily=f;}

    // All families for topBrand — from ad data (consistent source)
    const familiesForBrand = [...(famSpendPerBrand.get(topBrand)?.keys() ?? [])].filter(Boolean).sort();

    return NextResponse.json({ latestDate, dateOptions, topBrand, topFamily, allBrands, familiesForBrand });
  } catch (err) {
    console.error('sta GET error:', err);
    return NextResponse.json({ latestDate:null, dateOptions:[], topBrand:null, topFamily:null, allBrands:[] });
  }
}

// ── POST: main search term rows ───────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const {
      brands, families, startDate, endDate, mode,
      analyzeMode, analyzeBy, adType, brandMode,
    } = await req.json();

    const isMonthly = mode === 'monthly';
    const table     = isMonthly ? 'ad_search_terms_monthly' : 'ad_search_terms_weekly';
    const dateField = isMonthly ? 'month_start_date' : 'week_start_date';
    const termField = (analyzeBy==='keyword'||analyzeBy==='targeting') ? 'targeting' : 'customer_search_term';

    if (!brands?.length && !families?.length) return NextResponse.json({ data:[], requiresFilter:true });

    const brandFilter  = brands?.length  > 0 ? brands  : null;
    const familyFilter = families?.length > 0 ? families : null;

    // Previous period
    const prevStart = isMonthly ? shiftMonth(startDate,1) : shiftDate(startDate,7);
    const prevEnd   = isMonthly ? shiftMonth(endDate,1)   : shiftDate(endDate,7);

    // Resolve branded terms from SQP if needed
    let brandedTerms: string[]|null = null;
    let genericTerms: string[]|null = null;

    if (analyzeMode==='keywords' && (brandMode==='branded'||brandMode==='both')) {
      const sqpTable = isMonthly ? 'sqp_monthly' : 'sqp_weekly';
      const sqpDate  = isMonthly ? 'month_start_date' : 'week_start_date';
      let aQ = supabase.from('product_mapping').select('child_asin');
      if (familyFilter) aQ = aQ.in('family_name', familyFilter);
      else if (brandFilter) aQ = aQ.in('brand_name', brandFilter);
      const { data: asnData } = await aQ;
      const asins = ((asnData??[]) as {child_asin:string}[]).map(r=>r.child_asin);
      if (asins.length > 0) {
        const { data: btRows } = await supabase.from(sqpTable)
          .select('search_term').in('child_asin',asins)
          .gte(sqpDate,startDate).lte(sqpDate,endDate).eq('is_branded',true);
        brandedTerms = [...new Set(((btRows??[]) as {search_term:string}[]).map(r=>r.search_term.toLowerCase().trim()))];
      }
    }

    if (analyzeMode==='keywords' && (brandMode==='non-branded'||brandMode==='both')) {
      let fQ = supabase.from('product_mapping').select('family_name');
      if (familyFilter) fQ = fQ.in('family_name', familyFilter);
      else if (brandFilter) fQ = fQ.in('brand_name', brandFilter);
      const { data: famData } = await fQ;
      const relevantFamilies = [...new Set(((famData??[]) as {family_name:string}[]).map(r=>r.family_name))];
      if (relevantFamilies.length > 0) {
        const { data: kwData } = await supabase.from('keyword_tracker')
          .select('keyword').in('family_name', relevantFamilies);
        genericTerms = [...new Set(((kwData??[]) as {keyword:string}[]).map(r=>r.keyword.toLowerCase().trim()))];
      }
    }

    const buildQ = (s: string, e: string) => {
      let q = supabase.from(table)
        .select(`${dateField}, ${termField}, ad_type, impressions, clicks, total_orders, spend, total_sales`)
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

    type Agg = { impressions:number; clicks:number; orders:number; spend:number; sales:number };

    function aggregate(rows: Record<string,unknown>[]): Map<string,Agg> {
      const m = new Map<string,Agg>();
      for (const row of rows) {
        const raw = String(row[termField]??'').toLowerCase().trim();

        // Keywords mode: exclude ASINs and targeting entries
        if (analyzeMode==='keywords') {
          if (/^b0[a-z0-9]{8}$/i.test(raw)) continue;
          if (raw.startsWith('asin-'))       continue;
          if (raw.startsWith('category-'))   continue;
          // Brand mode filter
          if (brandMode==='branded') {
            if (!brandedTerms?.includes(raw)) continue;
          } else if (brandMode==='non-branded') {
            if (!genericTerms?.includes(raw)) continue;
          } else {
            const inG = genericTerms ? genericTerms.includes(raw) : true;
            const inB = brandedTerms ? brandedTerms.includes(raw) : false;
            if (!inG && !inB) continue;
          }
        }

        // ASIN mode: only include ASINs
        if (analyzeMode==='asins') {
          if (analyzeBy==='search_term') {
            if (!/^b0[a-z0-9]{8}$/i.test(raw)) continue;
          } else {
            if (!raw.startsWith('asin-')) continue;
          }
        }

        let term = raw;
        if (analyzeMode==='asins' && analyzeBy==='targeting') {
          const m2 = raw.match(/([a-z0-9]{10})"?$/i);
          if (!m2) continue;
          term = m2[1].toUpperCase();
        } else if (analyzeMode==='asins' && analyzeBy==='search_term') {
          term = raw.toUpperCase();
        }

        const e = m.get(term) ?? { impressions:0, clicks:0, orders:0, spend:0, sales:0 };
        e.impressions += Number(row.impressions)  || 0;
        e.clicks      += Number(row.clicks)       || 0;
        e.orders      += Number(row.total_orders) || 0;
        e.spend       += Number(row.spend)        || 0;
        e.sales       += Number(row.total_sales)  || 0;
        m.set(term, e);
      }
      return m;
    }

    const currMap = aggregate(currRows as Record<string,unknown>[]);
    const prevMap = aggregate((prevRows??[]) as Record<string,unknown>[]);

    const result: STARow[] = [];
    for (const [term, curr] of currMap) {
      const row = buildRow(curr, prevMap.get(term)??null);
      row.term = term;
      result.push(row);
    }
    result.sort((a,b)=>b.spend-a.spend);
    return NextResponse.json({ data: result });

  } catch (err) {
    console.error('sta route error:', err);
    return NextResponse.json({ error:String(err) }, { status:500 });
  }
}