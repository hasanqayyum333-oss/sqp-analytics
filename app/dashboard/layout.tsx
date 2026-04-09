'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { FilterProvider } from './filter-context';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const NAV_ITEMS = [
  {
    href: '/dashboard/trends',
    label: 'Trends',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
      </svg>
    ),
  },
  {
    href: '/dashboard/search-term-analyzer',
    label: 'Match Type Analysis',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
  },
  {
    href: '/dashboard/funnel',
    label: 'Keyword Deep Dive',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
      </svg>
    ),
  },
  {
    href: '/dashboard/yoy',
    label: 'YoY Comparison',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
      </svg>
    ),
  },
  {
    href: '/dashboard/branded',
    label: 'Branded vs Non-Branded',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
      </svg>
    ),
  },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  return (
    <div className="flex min-h-screen bg-zinc-900 text-white">
      {/* Sidebar */}
      <div
        className={`fixed left-0 top-0 h-full bg-zinc-800 border-r border-zinc-700 transition-all duration-200 z-50 flex flex-col ${expanded ? 'w-64' : 'w-[60px]'}`}
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
      >
        {/* Logo */}
        <div className="h-14 flex items-center border-b border-zinc-700 px-[14px] flex-shrink-0 overflow-hidden">
          <img src="/logo.png" alt="Sell Insights" className="w-8 h-8 flex-shrink-0 rounded-full object-cover" />
          {expanded && (
            <div className="ml-2.5 min-w-0">
              <p className="text-white font-bold text-sm whitespace-nowrap leading-tight">Sell Insights</p>
              <p className="text-orange-400 text-[10px] whitespace-nowrap font-medium leading-tight">Built to Scale.</p>
            </div>
          )}
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-3 overflow-hidden">
          {NAV_ITEMS.map(item => {
            const active = pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href}>
                <div className={`flex items-center gap-3 px-[18px] py-3 transition-colors cursor-pointer ${
                  active
                    ? 'text-orange-400 bg-orange-500/10 border-r-2 border-orange-400'
                    : 'text-zinc-300 hover:text-white hover:bg-zinc-700'
                }`}>
                  <div className="w-5 h-5 flex-shrink-0">{item.icon}</div>
                  {expanded && (
                    <p className="text-sm font-medium whitespace-nowrap">{item.label}</p>
                  )}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Bottom section: Upload + Logout */}
        <div className="border-t border-zinc-700 py-3 flex-shrink-0">
          {/* Upload */}
          <Link href="/upload">
            <div className="flex items-center gap-3 px-[18px] py-3 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors cursor-pointer">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5 flex-shrink-0">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              {expanded && <span className="text-sm whitespace-nowrap">Data Upload</span>}
            </div>
          </Link>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-[18px] py-3 text-zinc-400 hover:text-red-400 hover:bg-zinc-700 transition-colors cursor-pointer"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5 flex-shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
            </svg>
            {expanded && <span className="text-sm whitespace-nowrap">Sign out</span>}
          </button>
        </div>
      </div>

      {/* Blur overlay when sidebar expanded */}
      {expanded && (
        <div
          className="fixed inset-0 z-40 backdrop-blur-sm bg-black/20"
          onMouseEnter={() => setExpanded(false)}
        />
      )}

      {/* Main content */}
      <div className="flex-1 ml-[60px] min-h-screen min-w-0">
        <FilterProvider>
          {children}
        </FilterProvider>
      </div>
    </div>
  );
}