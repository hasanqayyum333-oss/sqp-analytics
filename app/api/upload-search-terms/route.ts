import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 120;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TABLE_MAP: Record<string, string> = {
  weekly:    'ad_search_terms_weekly',
  monthly:   'ad_search_terms_monthly',
  quarterly: 'ad_search_terms_quarterly',
};

const CONFLICT_COLS: Record<string, string> = {
  weekly:    'ad_type,campaign_name,customer_search_term,start_date',
  monthly:   'ad_type,campaign_name,customer_search_term,start_date',
  quarterly: 'ad_type,campaign_name,customer_search_term,start_date',
};

export async function POST(req: NextRequest) {
  try {
    const { rows, periodType } = await req.json();

    if (!rows || !periodType) {
      return NextResponse.json({ error: 'Missing rows or periodType' }, { status: 400 });
    }

    const table = TABLE_MAP[periodType];
    if (!table) {
      return NextResponse.json({ error: `Invalid periodType: ${periodType}` }, { status: 400 });
    }

    const CHUNK_SIZE = 500;
    let totalInserted = 0;
    let totalSkipped = 0;
    let duplicatesRemoved = 0;
    const batchErrors: string[] = [];

    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);

      // Deduplicate within the batch using the unique constraint key
      const seen = new Map<string, Record<string, unknown>>();
      for (const row of chunk) {
        const key = `${row.ad_type}|${row.campaign_name}|${row.customer_search_term}|${row.start_date}`;
        if (!seen.has(key)) {
          seen.set(key, row);
        } else {
          duplicatesRemoved++;
        }
      }
      const dedupedChunk = Array.from(seen.values());

      // Retry logic
      let lastError: string | null = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        const { error, count } = await supabase
          .from(table)
          .upsert(dedupedChunk, {
            onConflict: CONFLICT_COLS[periodType],
            count: 'exact',
          });

        if (!error) {
          totalInserted += count ?? dedupedChunk.length;
          lastError = null;
          break;
        }

        lastError = error.message;
        if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 1000));
      }

      if (lastError) {
        const batchNum = Math.floor(i / CHUNK_SIZE) + 1;
        batchErrors.push(`Batch ${batchNum}: ${lastError}`);
        totalSkipped += dedupedChunk.length;
      }

      await new Promise(r => setTimeout(r, 100));
    }

    return NextResponse.json({
      inserted: totalInserted,
      skipped: totalSkipped,
      duplicatesRemoved,
      total: rows.length,
      errors: batchErrors,
    });

  } catch (err: unknown) {
    console.error('upload-search-terms error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}