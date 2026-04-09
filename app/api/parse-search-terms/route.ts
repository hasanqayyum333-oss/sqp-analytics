import { NextRequest, NextResponse } from 'next/server';
import * as ExcelJS from 'exceljs';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 120;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// --- Column maps ---
// Note: start_date and end_date are intentionally excluded from both maps
// They are assigned from the user's selected week, not from the file

const SP_COL_MAP: Record<string, string> = {
  'portfolio name':                    'portfolio_name',
  'currency':                          'currency',
  'campaign name':                     'campaign_name',
  'ad group name':                     'ad_group_name',
  'retailer':                          'retailer',
  'country':                           'country',
  'targeting':                         'targeting',
  'match type':                        'match_type',
  'customer search term':              'customer_search_term',
  'impressions':                       'impressions',
  'clicks':                            'clicks',
  'click-thru rate (ctr)':             'ctr',
  'cost per click (cpc)':              'cpc',
  'spend':                             'spend',
  '7 day total sales':                 'total_sales',
  'total advertising cost of sales (acos)': 'acos',
  'total return on advertising spend (roas)': 'roas',
  '7 day total orders (#)':            'total_orders',
  '7 day total units (#)':             'total_units',
  '7 day conversion rate':             'conversion_rate',
  '7 day advertised sku units (#)':    'advertised_sku_units',
  '7 day other sku units (#)':         'other_sku_units',
  '7 day advertised sku sales':        'advertised_sku_sales',
  '7 day other sku sales':             'other_sku_sales',
};

const SB_COL_MAP: Record<string, string> = {
  'portfolio name':                    'portfolio_name',
  'currency':                          'currency',
  'campaign name':                     'campaign_name',
  'ad group name':                     'ad_group_name',
  'targeting':                         'targeting',
  'match type':                        'match_type',
  'customer search term':              'customer_search_term',
  'cost type':                         'cost_type',
  'impressions':                       'impressions',
  'viewable impressions':              'viewable_impressions',
  'clicks':                            'clicks',
  'click-thru rate (ctr)':             'ctr',
  'spend':                             'spend',
  'cost per click (cpc)':              'cpc',
  'cost per 1,000 viewable impressions (vcpm)': 'vcpm',
  'total advertising cost of sales (acos)': 'acos',
  'total return on advertising spend (roas)': 'roas',
  '14 day total sales':                'total_sales',
  '14 day total orders (#)':           'total_orders',
  '14 day total units (#)':            'total_units',
  '14 day conversion rate':            'conversion_rate',
  'total advertising cost of sales (acos) - (click)': 'acos_click',
  'total return on advertising spend (roas) - (click)': 'roas_click',
  '14 day total sales - (click)':      'sales_click',
  '14 day total orders (#) - (click)': 'orders_click',
  '14 day total units (#) - (click)':  'units_click',
};

function extractParentAsin(portfolioName: string | null): string | null {
  if (!portfolioName) return null;
  const cleaned = portfolioName.trim();
  if (cleaned.length < 10) return null;
  return cleaned.slice(-10).toUpperCase();
}

function parseNumeric(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const str = String(val).replace(/[%,$]/g, '').trim();
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

const NUMERIC_FIELDS = new Set([
  'impressions', 'clicks', 'ctr', 'cpc', 'spend', 'acos', 'roas',
  'total_sales', 'total_orders', 'total_units', 'conversion_rate',
  'advertised_sku_units', 'other_sku_units', 'advertised_sku_sales', 'other_sku_sales',
  'viewable_impressions', 'vcpm', 'acos_click', 'roas_click',
  'sales_click', 'orders_click', 'units_click',
]);

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file        = formData.get('file') as File;
    const adType      = (formData.get('adType') as string)?.toUpperCase(); // 'SP' or 'SB'
    const periodType  = formData.get('periodType') as string;              // 'weekly' | 'monthly' | 'quarterly'
    const periodStart = formData.get('periodStart') as string;             // e.g. '2026-02-22'
    const periodEnd   = formData.get('periodEnd') as string;               // e.g. '2026-02-28'
    const weekNumber  = formData.get('weekNumber') as string;              // e.g. '8'

    if (!file || !adType || !periodType || !periodStart || !periodEnd) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const colMap = adType === 'SP' ? SP_COL_MAP : SB_COL_MAP;

    // Parse Excel file
    const arrayBuffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (workbook.xlsx.load as unknown as (b: any) => Promise<void>)(Buffer.from(arrayBuffer));

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      return NextResponse.json({ error: 'No worksheet found in file' }, { status: 400 });
    }

    // Build header index from file
    const headerRow = worksheet.getRow(1);
    const headers: Record<number, string> = {};
    headerRow.eachCell((cell, colNumber) => {
      const key = String(cell.value ?? '').toLowerCase().trim();
      const mapped = colMap[key];
      if (mapped) headers[colNumber] = mapped;
    });

    // Validate we found key columns
    const mappedCols = Object.values(headers);
    if (!mappedCols.includes('customer_search_term')) {
      return NextResponse.json({
        error: `File does not appear to be a valid ${adType} Search Term Report. "Customer Search Term" column not found. Please check you selected the correct Ad Type.`
      }, { status: 400 });
    }

    // Fetch product_mapping for enrichment
    const { data: productMapping } = await supabase
      .from('product_mapping')
      .select('parent_asin, family_name, brand_name');

    const parentMap: Record<string, { family_name: string; brand_name: string }> = {};
    for (const row of productMapping ?? []) {
      if (row.parent_asin) {
        parentMap[row.parent_asin.toUpperCase()] = {
          family_name: row.family_name,
          brand_name: row.brand_name,
        };
      }
    }

    // Fetch brand_keywords for branded detection (same logic as SQP upload)
    const { data: brandKeywordsRows } = await supabase
      .from('brand_keywords')
      .select('brand_name, keyword');

    const brandKeywordsMap = new Map<string, string[]>();
    for (const row of brandKeywordsRows ?? []) {
      const b = (row.brand_name ?? '').toLowerCase();
      if (!brandKeywordsMap.has(b)) brandKeywordsMap.set(b, []);
      brandKeywordsMap.get(b)!.push((row.keyword ?? '').toLowerCase());
    }

    // Parse rows
    const rows: Record<string, unknown>[] = [];

    worksheet.eachRow((row, rowIndex) => {
      if (rowIndex === 1) return; // skip header

      const record: Record<string, unknown> = {
        // Always set ad_type from user selection
        ad_type: adType,

        // Always set dates from user selection — ignore file dates
        start_date:  periodStart,
        end_date:    periodEnd,
        week_number: weekNumber ? parseInt(weekNumber) : null,
      };

      // Add period-specific date field
      if (periodType === 'weekly')    record['week_start_date']    = periodStart;
      if (periodType === 'monthly')   record['month_start_date']   = periodStart;
      if (periodType === 'quarterly') record['quarter_start_date'] = periodStart;

      // Read mapped columns from file (skipping start_date / end_date)
      row.eachCell((cell, colNumber) => {
        const field = headers[colNumber];
        if (!field) return;

        if (NUMERIC_FIELDS.has(field)) {
          record[field] = parseNumeric(cell.value);
        } else {
          record[field] = cell.value ? String(cell.value).trim() : null;
        }
      });

      // Skip empty rows
      if (!record['customer_search_term'] && !record['campaign_name']) return;

      // Derive parent_asin from portfolio_name
      const parentAsin = extractParentAsin(record['portfolio_name'] as string);
      record['parent_asin'] = parentAsin;

      // Enrich with family_name and brand_name from product_mapping
      if (parentAsin && parentMap[parentAsin]) {
        record['family_name'] = parentMap[parentAsin].family_name;
        record['brand_name']  = parentMap[parentAsin].brand_name;
      }

      // Detect branded — check customer_search_term against brand_keywords (same logic as SQP upload)
      const term = String(record['customer_search_term'] ?? '').toLowerCase().trim();
      const brandKey = String(record['brand_name'] ?? '').toLowerCase();
      const keywords = brandKeywordsMap.get(brandKey) ?? [];
      record['is_branded'] = term.length > 0 && keywords.some(kw => term.includes(kw));

      rows.push(record);
    });

    return NextResponse.json({
      rows,
      count: rows.length,
      adType,
      periodType,
      periodStart,
      periodEnd,
      weekNumber,
    });

  } catch (err: unknown) {
    console.error('parse-search-terms error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}