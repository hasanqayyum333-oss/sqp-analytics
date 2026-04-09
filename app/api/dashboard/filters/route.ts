import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  const brands = searchParams.get('brands')?.split(',').filter(Boolean) ?? [];
  const families = searchParams.get('families')?.split(',').filter(Boolean) ?? [];

  try {
    if (type === 'brands') {
      const { data, error } = await supabase
        .from('product_mapping')
        .select('brand_name')
        .not('brand_name', 'is', null)
        .order('brand_name');
      if (error) throw error;
      const unique = [...new Set(data.map((r: { brand_name: string }) => r.brand_name))];
      return NextResponse.json({ brands: unique });
    }

    if (type === 'families') {
      let query = supabase
        .from('product_mapping')
        .select('family_name, brand_name')
        .not('family_name', 'is', null)
        .order('family_name');
      if (brands.length > 0) query = query.in('brand_name', brands);
      const { data, error } = await query;
      if (error) throw error;
      const seen = new Set<string>();
      const unique = data.filter((r: { family_name: string }) => {
        if (seen.has(r.family_name)) return false;
        seen.add(r.family_name);
        return true;
      });
      return NextResponse.json({ families: unique });
    }

    if (type === 'asins') {
      let query = supabase
        .from('product_mapping')
        .select('child_asin, product_name, family_name, brand_name')
        .order('product_name');
      if (families.length > 0) {
        query = query.in('family_name', families);
      } else if (brands.length > 0) {
        query = query.in('brand_name', brands);
      }
      const { data, error } = await query;
      if (error) throw error;
      return NextResponse.json({ asins: data });
    }

    if (type === 'keywords') {
      const familiesParam = searchParams.get('families')?.split(',').filter(Boolean) ?? [];
      if (familiesParam.length === 0) return NextResponse.json({ keywords: [] });
      const { data, error } = await supabase
        .from('keyword_tracker')
        .select('keyword')
        .in('family_name', familiesParam)
        .order('keyword');
      if (error) throw error;
      const unique = [...new Set(data.map((r: { keyword: string }) => r.keyword))].sort();
      return NextResponse.json({ keywords: unique });
    }

    // Returns the family with highest impressions_asin for a brand in the latest week
    if (type === 'top-family') {
      const brand = searchParams.get('brand');
      if (!brand) return NextResponse.json({ family: null });

      // Get all ASINs + families for this brand
      const { data: asins } = await supabase
        .from('product_mapping')
        .select('child_asin, family_name')
        .eq('brand_name', brand);

      if (!asins || asins.length === 0) return NextResponse.json({ family: null });

      const asinList = asins.map((a: { child_asin: string }) => a.child_asin);

      // Find the most recent week that has data
      const { data: latestWeek } = await supabase
        .from('sqp_weekly')
        .select('week_start_date')
        .in('child_asin', asinList)
        .order('week_start_date', { ascending: false })
        .limit(1);

      if (!latestWeek || latestWeek.length === 0) return NextResponse.json({ family: null });

      const weekDate = latestWeek[0].week_start_date;

      // Get impressions per ASIN for that week
      const { data: rows } = await supabase
        .from('sqp_weekly')
        .select('child_asin, impressions_asin')
        .in('child_asin', asinList)
        .eq('week_start_date', weekDate);

      if (!rows || rows.length === 0) return NextResponse.json({ family: null });

      // Sum impressions per family
      const familyMap = new Map<string, number>();
      const asinFamilyMap = new Map(
        asins.map((a: { child_asin: string; family_name: string }) => [a.child_asin, a.family_name])
      );

      for (const row of rows) {
        const family = asinFamilyMap.get(row.child_asin);
        if (!family) continue;
        familyMap.set(family, (familyMap.get(family) ?? 0) + (Number(row.impressions_asin) || 0));
      }

      // Return family with highest impressions
      let topFamily = '';
      let topImpressions = -1;
      for (const [family, impressions] of familyMap.entries()) {
        if (impressions > topImpressions) {
          topImpressions = impressions;
          topFamily = family;
        }
      }

      return NextResponse.json({ family: topFamily || null });
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}