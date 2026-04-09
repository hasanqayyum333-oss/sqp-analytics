import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── Date label helpers ────────────────────────────────────────────────────────

function fmtDay(dateStr: string): string {
  const d   = new Date(dateStr + 'T12:00:00Z');
  const day = d.getUTCDate();
  const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()];
  const yr  = String(d.getUTCFullYear()).slice(2);
  return `${day} ${mon} ${yr}`;
}

function fmtWeekLabel(startStr: string, endStr: string | null, weekNum: number | null): string {
  const yr   = new Date(startStr + 'T12:00:00Z').getUTCFullYear();
  const wPfx = weekNum ? `W${weekNum}/${yr} — ` : '';
  const s    = fmtDay(startStr);
  const e    = endStr ? ` to ${fmtDay(endStr)}` : '';
  return `${wPfx}${s}${e}`;
}

function fmtMonthLabel(dateStr: string): string {
  const d   = new Date(dateStr + 'T12:00:00Z');
  const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()];
  return `${mon} ${d.getUTCFullYear()}`;
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const {
      mode,
      startDate,
      endDate,
      brands,
      families,
      adType,       // 'SP' | 'SB' | undefined (both) — uppercase from frontend
      matchType,    // e.g. 'exact' | null
      campaignName, // campaign name string | null
      term,         // search term (MTA 2.0 rows) | null
      includeSqp,   // boolean — also fetch SQP per-period data
    } = await req.json();

    const isMonthly = mode === 'monthly';
    const table     = isMonthly ? 'ad_search_terms_monthly' : 'ad_search_terms_weekly';
    const dateField = isMonthly ? 'month_start_date' : 'week_start_date';

    const brandFilter  = brands?.length  > 0 ? brands  : null;
    const familyFilter = families?.length > 0 ? families : null;

    // Only select week_number and end_date for weekly (monthly table doesn't have them)
    const dateCols  = isMonthly
      ? dateField
      : `${dateField}, end_date, week_number`;
    const filterCols = `ad_type, final_match_type, campaign_name${term ? ', customer_search_term' : ''}`;
    const selectStr  = `${dateCols}, impressions, clicks, spend, total_sales, total_orders, ${filterCols}`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = supabase
      .from(table)
      .select(selectStr)
      .gte(dateField, startDate)
      .lte(dateField, endDate)
      .order(dateField, { ascending: false });

    if (brandFilter)  q = q.in('brand_name',  brandFilter);
    if (familyFilter) q = q.in('family_name', familyFilter);

    // Ad type filter — frontend sends uppercase or undefined
    if (adType && adType !== 'BOTH') {
      q = q.eq('ad_type', String(adType).toUpperCase());
    }

    // Row-level filters
    if (matchType)    q = q.ilike('final_match_type', matchType);
    if (campaignName) q = q.eq('campaign_name', campaignName);
    if (term)         q = q.ilike('customer_search_term', term.toLowerCase().trim());

    // ── SQP per-period (only when includeSqp + term provided) ────────────────
    type SqpAgg = {
      sv: number;
      mktImpr: number; ourImpr: number;
      mktClk:  number; ourClk:  number;
      mktCart: number; ourCart: number;
      mktPurch:number; ourPurch:number;
      mktRev:  number; ourRev:  number;
      termSeen: boolean;
    };
    let sqpByDate: Map<string, SqpAgg> | null = null;

    // Build SQP promise (resolves to sqpRows or null) in parallel with ads query
    const sqpPromise: Promise<Record<string, unknown>[] | null> = (async () => {
      if (!includeSqp || !term) return null;
      const sqpTable = isMonthly ? 'sqp_monthly'     : 'sqp_weekly';
      const sqpDate  = isMonthly ? 'month_start_date' : 'week_start_date';
      let aQ = supabase.from('product_mapping').select('child_asin');
      if (familyFilter)     aQ = aQ.in('family_name', familyFilter);
      else if (brandFilter) aQ = aQ.in('brand_name',  brandFilter);
      const { data: asnData } = await aQ;
      const relevantAsins = ((asnData ?? []) as { child_asin: string }[]).map(r => r.child_asin);
      if (!relevantAsins.length) return null;
      const sqpCols = [sqpDate,'search_volume','impressions_total','impressions_asin','clicks_total','clicks_asin','cart_adds_total','cart_adds_asin','purchases_total','purchases_asin','purchases_price_median','purchases_asin_price_median'].join(',');
      const { data: sqpRows } = await supabase.from(sqpTable).select(sqpCols)
        .in('child_asin', relevantAsins)
        .eq('search_term', term.toLowerCase().trim())
        .gte(sqpDate, startDate).lte(sqpDate, endDate);
      return (sqpRows as Record<string, unknown>[] | null) ?? null;
    })();

    const [{ data: rows, error }, sqpRawRows] = await Promise.all([q, sqpPromise]);
    if (error) throw error;
    if (!rows?.length) return NextResponse.json({ data: [] });

    // Process SQP raw rows into per-date map
    if (sqpRawRows?.length) {
      const sqpDate = isMonthly ? 'month_start_date' : 'week_start_date';
      sqpByDate = new Map<string, SqpAgg>();
      for (const r of sqpRawRows) {
        const dk = String(r[sqpDate] ?? '');
        if (!dk) continue;
        if (!sqpByDate.has(dk)) {
          sqpByDate.set(dk, { sv:0, mktImpr:0, ourImpr:0, mktClk:0, ourClk:0, mktCart:0, ourCart:0, mktPurch:0, ourPurch:0, mktRev:0, ourRev:0, termSeen:false });
        }
        const p = sqpByDate.get(dk)!;
        if (!p.termSeen) {
          p.termSeen = true;
          p.sv       = Number(r.search_volume) || 0;
          p.mktImpr  = Number(r.impressions_total) || 0;
          p.mktClk   = Number(r.clicks_total)      || 0;
          p.mktCart  = Number(r.cart_adds_total)   || 0;
          p.mktPurch = Number(r.purchases_total)   || 0;
          p.mktRev   = (Number(r.purchases_price_median) || 0) * (Number(r.purchases_total) || 0);
        }
        p.ourImpr  += Number(r.impressions_asin) || 0;
        p.ourClk   += Number(r.clicks_asin)      || 0;
        p.ourCart  += Number(r.cart_adds_asin)   || 0;
        p.ourPurch += Number(r.purchases_asin)   || 0;
        p.ourRev   += (Number(r.purchases_asin_price_median) || 0) * (Number(r.purchases_asin) || 0);
      }
    }

    // ── Aggregate by period ───────────────────────────────────────────────────
    type Agg = {
      dateKey: string;
      endDate: string | null;
      weekNum: number | null;
      imp: number; clk: number; ord: number; spend: number; sales: number;
    };

    const pm = new Map<string, Agg>();

    for (const r of rows as Record<string, unknown>[]) {
      const dk = String(r[dateField] ?? '');
      if (!dk) continue;

      if (!pm.has(dk)) {
        pm.set(dk, {
          dateKey: dk,
          endDate: isMonthly ? null : (String(r.end_date ?? '') || null),
          weekNum: isMonthly ? null : (Number(r.week_number) || null),
          imp: 0, clk: 0, ord: 0, spend: 0, sales: 0,
        });
      }

      const p = pm.get(dk)!;
      // Capture end_date/week_number once per dateKey (same for all rows in a period)
      if (!isMonthly) {
        if (!p.endDate && r.end_date)    p.endDate = String(r.end_date);
        if (!p.weekNum && r.week_number) p.weekNum = Number(r.week_number);
      }

      p.imp   += Number(r.impressions)  || 0;
      p.clk   += Number(r.clicks)       || 0;
      p.ord   += Number(r.total_orders) || 0;
      p.spend += Number(r.spend)        || 0;
      p.sales += Number(r.total_sales)  || 0;
    }

    // Sort newest first
    const sorted = Array.from(pm.values()).sort((a, b) => b.dateKey.localeCompare(a.dateKey));

    // ── Build result rows with WoW deltas ─────────────────────────────────────
    const pctFn = (a: number, b: number) => b ? ((a - b) / Math.abs(b)) * 100 : null;
    const ppFn  = (a: number, b: number) => a - b;

    const result = sorted.map((p, i) => {
      const prev  = sorted[i + 1] ?? null;
      const ctr   = p.imp   > 0 ? (p.clk   / p.imp)   * 100 : 0;
      const cvr   = p.clk   > 0 ? (p.ord   / p.clk)   * 100 : 0;
      const cpc   = p.clk   > 0 ?  p.spend / p.clk         : 0;
      const acos  = p.sales > 0 ? (p.spend / p.sales) * 100 : 0;
      const roas  = p.spend > 0 ?  p.sales / p.spend       : 0;
      const pctr  = prev && prev.imp   > 0 ? (prev.clk  / prev.imp)   * 100 : 0;
      const pcvr  = prev && prev.clk   > 0 ? (prev.ord  / prev.clk)   * 100 : 0;
      const pcpc  = prev && prev.clk   > 0 ?  prev.spend / prev.clk        : 0;
      const pacos = prev && prev.sales > 0 ? (prev.spend / prev.sales) * 100 : 0;
      const proas = prev && prev.spend > 0 ?  prev.sales / prev.spend      : 0;

      const label = isMonthly
        ? fmtMonthLabel(p.dateKey)
        : fmtWeekLabel(p.dateKey, p.endDate, p.weekNum);

      // ── SQP fields (if available for this period) ──────────────────────────
      let sqpFields: Record<string, number | null> = {};
      if (sqpByDate) {
        const sqpD = sqpByDate.get(p.dateKey);
        const sqpP = prev ? (sqpByDate.get(prev.dateKey) ?? null) : null;
        if (sqpD) {
          const impShare   = sqpD.mktImpr  > 0 ? (sqpD.ourImpr  / sqpD.mktImpr)  * 100 : 0;
          const clkShare   = sqpD.mktClk   > 0 ? (sqpD.ourClk   / sqpD.mktClk)   * 100 : 0;
          const cartShare  = sqpD.mktCart  > 0 ? (sqpD.ourCart  / sqpD.mktCart)  * 100 : 0;
          const purchShare = sqpD.mktPurch > 0 ? (sqpD.ourPurch / sqpD.mktPurch) * 100 : 0;
          const revShare   = sqpD.mktRev   > 0 ? (sqpD.ourRev   / sqpD.mktRev)   * 100 : 0;
          const pImpShare   = sqpP && sqpP.mktImpr  > 0 ? (sqpP.ourImpr  / sqpP.mktImpr)  * 100 : 0;
          const pClkShare   = sqpP && sqpP.mktClk   > 0 ? (sqpP.ourClk   / sqpP.mktClk)   * 100 : 0;
          const pCartShare  = sqpP && sqpP.mktCart  > 0 ? (sqpP.ourCart  / sqpP.mktCart)  * 100 : 0;
          const pPurchShare = sqpP && sqpP.mktPurch > 0 ? (sqpP.ourPurch / sqpP.mktPurch) * 100 : 0;
          const pRevShare   = sqpP && sqpP.mktRev   > 0 ? (sqpP.ourRev   / sqpP.mktRev)   * 100 : 0;
          sqpFields = {
            searchVolume:         sqpD.sv,
            searchVolumeDelta:    sqpP && sqpP.sv > 0 ? pctFn(sqpD.sv, sqpP.sv) : null,
            impressionShare:      impShare,
            impressionShareDelta: sqpP ? ppFn(impShare,   pImpShare)   : null,
            clickShare:           clkShare,
            clickShareDelta:      sqpP ? ppFn(clkShare,   pClkShare)   : null,
            cartShare,
            cartShareDelta:       sqpP ? ppFn(cartShare,  pCartShare)  : null,
            purchaseShare:        purchShare,
            purchaseShareDelta:   sqpP ? ppFn(purchShare, pPurchShare) : null,
            revenueShare:         revShare,
            revenueShareDelta:    sqpP ? ppFn(revShare,   pRevShare)   : null,
          };
        }
      }

      return {
        dateKey: p.dateKey,
        label,
        impressions: p.imp, clicks: p.clk, orders: p.ord, spend: p.spend, sales: p.sales,
        ctr, cvr, cpc, acos, roas,
        impDelta:   prev ? pctFn(p.imp,   prev.imp)   : null,
        clkDelta:   prev ? pctFn(p.clk,   prev.clk)   : null,
        ctrDelta:   prev ? ppFn(ctr,   pctr)           : null,
        ordDelta:   prev ? pctFn(p.ord,   prev.ord)   : null,
        cvrDelta:   prev ? ppFn(cvr,   pcvr)           : null,
        cpcDelta:   prev ? pctFn(cpc,   pcpc)          : null,
        spendDelta: prev ? pctFn(p.spend, prev.spend) : null,
        salesDelta: prev ? pctFn(p.sales, prev.sales) : null,
        acosDelta:  prev ? ppFn(acos,  pacos)          : null,
        roasDelta:  prev ? ppFn(roas,  proas)          : null,
        ...sqpFields,
      };
    });

    return NextResponse.json({ data: result });

  } catch (err) {
    console.error('sta show-data error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}