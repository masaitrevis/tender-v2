/**
 * Analytics — /analytics
 * KPI & BI dashboard: win-rate trend, monthly revenue & forecast, revenue by
 * client, pipeline mix, collections aging, officer leaderboard, compliance gauge.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, useInView, animate } from 'framer-motion';
import {
  Trophy, Banknote, CalendarClock, Gauge, FileSignature, ShieldAlert,
  Download, MoreHorizontal, Medal, ArrowRight, Table2, ImageDown, FileBarChart,
} from 'lucide-react';
import {
  ComposedChart, Area, Line, Bar, BarChart, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { useStore, computeKPIs, daysUntil, type AppState } from '@/lib/store';
import { formatKES, formatKESCompact, formatDate } from '@/lib/format';
import { PageHeader, StatChip } from '@/components/shared';
import { cn } from '@/lib/utils';

/* ---------------- count-up ---------------- */
function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, value, { duration: 0.8, ease: 'easeOut', onUpdate: (v) => setDisplay(v) });
    return () => controls.stop();
  }, [inView, value]);
  return <span ref={ref}>{format(display)}</span>;
}

/* ---------------- chart card with … menu ---------------- */
function ChartCard({
  title,
  subtitle,
  table,
  children,
  className,
  delay = 0,
}: {
  title: string;
  subtitle?: string;
  table?: { head: string[]; rows: (string | number)[][] };
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const exportPng = () => {
    const svg = bodyRef.current?.querySelector('svg');
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = (svg.clientWidth || 800) * 2;
      canvas.height = (svg.clientHeight || 320) * 2;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
      a.click();
    };
    img.onerror = () => {
      const blob = new Blob([xml], { type: 'image/svg+xml' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.svg`;
      a.click();
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut', delay }}
      className={cn('rounded-xl border border-app-border bg-app-card p-4 shadow-card', className)}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-[15px] font-semibold text-app-ink">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-app-muted">{subtitle}</p>}
        </div>
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-app-muted hover:bg-app-bg"
            aria-label={`${title} menu`}
          >
            <MoreHorizontal size={16} />
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-8 z-10 w-44 rounded-xl border border-app-border bg-white p-1 shadow-card-hover"
              onMouseLeave={() => setMenuOpen(false)}
            >
              {table && (
                <button
                  onClick={() => {
                    setShowTable((v) => !v);
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] text-app-ink hover:bg-app-bg"
                >
                  <Table2 size={14} className="text-app-muted" /> View data table
                </button>
              )}
              <button
                onClick={() => {
                  exportPng();
                  setMenuOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] text-app-ink hover:bg-app-bg"
              >
                <ImageDown size={14} className="text-app-muted" /> Export PNG
              </button>
              <button
                onClick={() => navigate('/reports')}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] text-app-ink hover:bg-app-bg"
              >
                <FileBarChart size={14} className="text-app-muted" /> Add to report
              </button>
            </div>
          )}
        </div>
      </div>
      <div ref={bodyRef}>{children}</div>
      {showTable && table && (
        <div className="mt-3 overflow-x-auto rounded-lg border border-app-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#F8FAFC] text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-app-muted">
                {table.head.map((h) => (
                  <th key={h} className="px-3 py-2">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i} className="border-t border-[#EEF1F5]">
                  {r.map((c, j) => (
                    <td key={j} className="px-3 py-1.5 text-app-slate tnum">{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  );
}

/* ---------------- derived series ---------------- */
type Period = 'month' | 'quarter' | 'year';

const NAVY = '#1F3B57';
const GOLD = '#C9A227';
const BLUE = '#2563EB';
const GREEN = '#16A34A';
const AMBER = '#D97706';
const RED = '#DC2626';
const PURPLE = '#7C3AED';

function monthKey(iso: string) {
  return iso.slice(0, 7);
}

/** Last 12 month buckets ending 2026-07. */
function last12Months(): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  const d = new Date('2026-07-01T00:00:00');
  for (let i = 11; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push({
      key: `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`,
      label: m.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }),
    });
  }
  return out;
}

function windowMonths(period: Period, all: { key: string; label: string }[]) {
  if (period === 'year') return all;
  if (period === 'quarter') return all.slice(-3);
  return all.slice(-1);
}

/** Supplies / Works / Services bucket for a tender category. */
function categoryGroup(category: string): 'Supplies' | 'Works' | 'Services' {
  const c = category.toLowerCase();
  if (/(service|hospitality|catering)/.test(c)) return 'Services';
  if (/(construction|works|installation|security system)/.test(c)) return 'Works';
  return 'Supplies';
}

/* ---------------- page ---------------- */
export default function Analytics() {
  const state = useStore();
  const [period, setPeriod] = useState<Period>('year');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const kpis = useMemo(() => computeKPIs(state), [state]);

  /* Executive KPIs */
  const avgBidValue = state.tenders.length
    ? state.tenders.reduce((a, t) => a + t.value, 0) / state.tenders.length
    : 0;
  const awarded = state.tenders.filter((t) => t.awardDate);
  const avgDaysToAward = awarded.length
    ? Math.round(awarded.reduce((a, t) => a + Math.max(0, daysUntil(t.awardDate!, t.submissionDeadline)), 0) / awarded.length)
    : 0;
  const invoices = state.documents.filter((d) => d.type === 'invoice');
  const invoicedTotal = invoices.reduce((a, d) => a + d.total, 0);
  const collectionRate = invoicedTotal ? Math.round((kpis.collectedRevenue / invoicedTotal) * 100) : 0;
  const docsExpiring30 = state.dms.filter(
    (d) => d.expiryDate && daysUntil(d.expiryDate) >= 0 && daysUntil(d.expiryDate) <= state.settings.warningDays,
  ).length;

  /* Win-rate trend (cumulative) + tenders won per month (bars) */
  const months = useMemo(() => last12Months(), []);
  const trendWindow = useMemo(() => windowMonths(period, months), [period, months]);

  const winTrend = useMemo(() => {
    let wonSoFar = 0;
    let decidedSoFar = 0;
    return trendWindow.map((m) => {
      const wonThis = state.tenders.filter((t) => t.status === 'Won' && monthKey(t.submissionDeadline) === m.key).length;
      const lostThis = state.tenders.filter((t) => t.status === 'Lost' && monthKey(t.submissionDeadline) === m.key).length;
      wonSoFar += wonThis;
      decidedSoFar += wonThis + lostThis;
      return {
        month: m.label,
        winRate: decidedSoFar ? Math.round((wonSoFar / decidedSoFar) * 100) : 0,
        won: state.tenders.filter((t) => t.status === 'Won' && t.awardDate && monthKey(t.awardDate) === m.key).length,
      };
    });
  }, [state, trendWindow]);

  /* Monthly revenue (invoice totals) + forecast (pipeline × win rate) + margin line */
  const inRange = (iso: string) => {
    const d = iso.slice(0, 10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  };

  const marginRatio = useMemo(() => {
    const sell = state.products.reduce((a, p) => a + p.sellingPrice, 0);
    if (!sell) return 0;
    return state.products.reduce((a, p) => a + (p.sellingPrice - p.costPrice), 0) / sell;
  }, [state.products]);

  interface RevenueRow {
    month: string;
    invoiced: number;
    collected: number;
    forecast?: number;
    margin: number;
  }
  const revenueSeries = useMemo<RevenueRow[]>(() => {
    const rows: RevenueRow[] = trendWindow.map((m) => {
      const invoiced = invoices
        .filter((d) => monthKey(d.issueDate) === m.key && inRange(d.issueDate))
        .reduce((a, d) => a + d.total, 0);
      const collected = state.payments
        .filter((p) => monthKey(p.date) === m.key)
        .reduce((a, p) => a + p.amount, 0);
      return {
        month: m.label,
        invoiced: Math.round(invoiced),
        collected: Math.round(collected),
        margin: Math.round(marginRatio * 100),
      };
    });
    if (period === 'year') {
      const forecastMonthly = Math.round(kpis.expectedRevenue / 3);
      ['Aug 2026', 'Sep 2026', 'Oct 2026'].forEach((label) =>
        rows.push({ month: label, invoiced: 0, collected: 0, forecast: forecastMonthly, margin: Math.round(marginRatio * 100) }),
      );
    }
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, trendWindow, kpis.expectedRevenue, marginRatio, from, to, period]);

  /* Revenue by client (top 6) */
  const revenueByClient = useMemo(() => {
    const map = new Map<string, number>();
    invoices.filter((d) => inRange(d.issueDate)).forEach((d) => {
      map.set(d.clientId, (map.get(d.clientId) ?? 0) + d.total);
    });
    return [...map.entries()]
      .map(([id, total]) => ({
        name: state.clients.find((c) => c.id === id)?.name ?? 'Unknown',
        revenue: Math.round(total),
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, from, to]);

  /* Pipeline by category group (active tenders) */
  const pipelineByCategory = useMemo(() => {
    const active = state.tenders.filter((t) => ['Open', 'Submitted', 'Under Evaluation'].includes(t.status));
    const sums: Record<string, number> = { Supplies: 0, Works: 0, Services: 0 };
    active.forEach((t) => {
      sums[categoryGroup(t.category)] += t.value;
    });
    return [
      { name: 'Supplies', value: Math.round(sums.Supplies), color: BLUE },
      { name: 'Works', value: Math.round(sums.Works), color: GOLD },
      { name: 'Services', value: Math.round(sums.Services), color: PURPLE },
    ].filter((x) => x.value > 0);
  }, [state]);

  /* Collections aging (outstanding invoice balances bucketed by days overdue) */
  const agingData = useMemo(() => {
    const buckets = new Map<string, { client: string; Current: number; '1–30': number; '31–60': number; '60+': number }>();
    invoices
      .filter((d) => d.status !== 'Paid' && d.status !== 'Cancelled')
      .forEach((d) => {
        const balance = Math.max(0, d.total - d.amountPaid);
        if (balance <= 0) return;
        const client = state.clients.find((c) => c.id === d.clientId)?.name ?? 'Unknown';
        if (!buckets.has(client)) buckets.set(client, { client, Current: 0, '1–30': 0, '31–60': 0, '60+': 0 });
        const row = buckets.get(client)!;
        const od = d.dueDate ? -daysUntil(d.dueDate) : 0;
        if (od <= 0) row.Current += balance;
        else if (od <= 30) row['1–30'] += balance;
        else if (od <= 60) row['31–60'] += balance;
        else row['60+'] += balance;
      });
    return [...buckets.values()].map((r) => ({
      ...r,
      Current: Math.round(r.Current),
      '1–30': Math.round(r['1–30']),
      '31–60': Math.round(r['31–60']),
      '60+': Math.round(r['60+']),
    }));
  }, [state, invoices]);

  /* Officer leaderboard (Tender Manager leads wins, rest rotated deterministically) */
  const leaderboard = useMemo(() => {
    const officers = ['Caroline Wanjiru', 'Kevin Omondi', 'Faith Achieng', 'Mercy Njeri', 'Admin User'];
    const stats = new Map<string, { handled: number; won: number }>();
    officers.forEach((o) => stats.set(o, { handled: 0, won: 0 }));
    let rot = 1;
    state.tenders.forEach((t) => {
      const owner = t.status === 'Won' ? 'Caroline Wanjiru' : officers[rot++ % officers.length];
      const s = stats.get(owner)!;
      s.handled += 1;
      if (t.status === 'Won') s.won += 1;
    });
    return officers
      .map((name) => {
        const s = stats.get(name)!;
        return {
          name,
          initials: name.split(' ').map((w) => w[0]).slice(0, 2).join(''),
          handled: s.handled,
          won: s.won,
          winRate: s.handled ? Math.round((s.won / s.handled) * 100) : 0,
        };
      })
      .sort((a, b) => b.won - a.won || b.winRate - a.winRate || b.handled - a.handled);
  }, [state]);

  /* Compliance health — % of business documents valid */
  const compliance = useMemo(() => {
    const total = state.dms.length;
    if (!total) return { pct: 0, renewals: 0 };
    const needs = state.dms.filter((d) => d.expiryDate && daysUntil(d.expiryDate) <= state.settings.warningDays).length;
    return { pct: Math.round(((total - needs) / total) * 100), renewals: needs };
  }, [state]);

  const statChips = [
    { label: 'Win Rate', value: kpis.successRate, format: (n: number) => `${Math.round(n)}%`, icon: <Trophy size={18} />, variant: 'gold' as const, caption: `${kpis.won} won of ${kpis.won + kpis.lost} decided` },
    { label: 'Avg Bid Value', value: avgBidValue, format: formatKESCompact, icon: <Banknote size={18} />, variant: 'navy' as const, caption: `${state.tenders.length} tenders on register` },
    { label: 'Avg Days to Award', value: avgDaysToAward, format: (n: number) => `${Math.round(n)}d`, icon: <CalendarClock size={18} />, variant: 'blue' as const, caption: 'submission → award letter' },
    { label: 'Collection Rate', value: collectionRate, format: (n: number) => `${Math.round(n)}%`, icon: <Gauge size={18} />, variant: 'green' as const, caption: `${formatKESCompact(kpis.collectedRevenue)} of ${formatKESCompact(invoicedTotal)}` },
    { label: 'Active Contracts', value: kpis.runningContracts, format: (n: number) => `${Math.round(n)}`, icon: <FileSignature size={18} />, variant: 'purple' as const, caption: 'framework & project contracts' },
    { label: 'Docs Expiring ≤30d', value: docsExpiring30, format: (n: number) => `${Math.round(n)}`, icon: <ShieldAlert size={18} />, variant: 'amber' as const, caption: 'business documents (DMS)' },
  ];

  return (
    <div className="px-7 pb-8 pt-6">
      <PageHeader
        title="Analytics"
        subtitle="Performance across tenders, revenue and operations."
        actions={
          <>
            {/* period segmented control */}
            <div className="flex rounded-lg border border-app-border bg-white p-0.5">
              {(['month', 'quarter', 'year'] as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={cn(
                    'relative h-8 rounded-md px-3 text-[13px] font-semibold capitalize transition-colors',
                    period === p ? 'text-white' : 'text-app-slate hover:text-app-ink',
                  )}
                >
                  {period === p && (
                    <motion.span layoutId="analytics-period" className="absolute inset-0 rounded-md bg-navy-800" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />
                  )}
                  <span className="relative">{p === 'month' ? 'Month' : p === 'quarter' ? 'Quarter' : 'Year'}</span>
                </button>
              ))}
            </div>
            {/* date range */}
            <div className="flex items-center gap-1.5 rounded-lg border border-app-border bg-white px-2 py-1">
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-7 bg-transparent text-xs text-app-ink outline-none tnum" aria-label="From date" />
              <span className="text-xs text-app-muted">→</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-7 bg-transparent text-xs text-app-ink outline-none tnum" aria-label="To date" />
            </div>
            <button
              onClick={() => window.print()}
              className="flex h-9 items-center gap-2 rounded-lg bg-action px-4 text-[13px] font-semibold text-white transition hover:-translate-y-px hover:bg-action-hover active:scale-[.98]"
            >
              <Download size={15} /> Export PDF
            </button>
          </>
        }
      />

      {/* KPI ribbon */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {statChips.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut', delay: i * 0.05 }}
          >
            <StatChip icon={s.icon} label={s.label} variant={s.variant} caption={s.caption} value={<CountUp value={s.value} format={s.format} />} />
          </motion.div>
        ))}
      </div>

      {/* Chart grid */}
      <div key={period} className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* 1. Win Rate Trend + tenders won per month */}
        <ChartCard
          title="Win Rate Trend"
          subtitle="Cumulative win rate · green bars = tenders won per month"
          delay={0.04}
          table={{
            head: ['Month', 'Win rate %', 'Tenders won'],
            rows: winTrend.map((r) => [r.month, r.winRate, r.won]),
          }}
        >
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={winTrend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="winFade" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={GOLD} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={GOLD} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF1F5" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#8494A7' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#8494A7' }} tickLine={false} axisLine={false} domain={[0, 100]} unit="%" />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#8494A7' }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  formatter={(v: number, name: string) => (name === 'Win rate' ? [`${v}%`, name] : [v, 'Tenders won'])}
                  contentStyle={{ borderRadius: 12, border: '1px solid #E4E9F0', fontSize: 12 }}
                />
                <Bar yAxisId="right" dataKey="won" fill={GREEN} radius={[4, 4, 0, 0]} barSize={14} isAnimationActive animationDuration={800} />
                <Area yAxisId="left" type="monotone" dataKey="winRate" name="Win rate" stroke={GOLD} strokeWidth={2.5} fill="url(#winFade)" animationDuration={800} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* 2. Monthly revenue & forecast */}
        <ChartCard
          title="Monthly Revenue & Forecast"
          subtitle="Invoiced vs collected · gold bars = pipeline × win rate forecast"
          delay={0.08}
          table={{
            head: ['Month', 'Invoiced', 'Collected', 'Forecast', 'Margin %'],
            rows: revenueSeries.map((r) => [r.month, formatKES(r.invoiced, { decimals: 0 }), formatKES(r.collected, { decimals: 0 }), r.forecast ? formatKES(r.forecast, { decimals: 0 }) : '—', r.margin]),
          }}
        >
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={revenueSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF1F5" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#8494A7' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#8494A7' }} tickLine={false} axisLine={false} tickFormatter={(v: number) => formatKESCompact(v).replace('KES ', '')} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#8494A7' }} tickLine={false} axisLine={false} unit="%" domain={[0, 60]} hide />
                <Tooltip
                  formatter={(v: number, name: string) => (name === 'Margin %' ? [`${v}%`, name] : [formatKES(v, { decimals: 0 }), name])}
                  contentStyle={{ borderRadius: 12, border: '1px solid #E4E9F0', fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="left" dataKey="invoiced" name="Invoiced" fill={NAVY} radius={[4, 4, 0, 0]} barSize={16} animationDuration={800} />
                <Bar yAxisId="left" dataKey="collected" name="Collected" fill={GREEN} radius={[4, 4, 0, 0]} barSize={16} animationDuration={800} />
                <Bar yAxisId="left" dataKey="forecast" name="Forecast" fill={GOLD} radius={[4, 4, 0, 0]} barSize={16} animationDuration={800} fillOpacity={0.85} />
                <Line yAxisId="right" type="monotone" dataKey="margin" name="Margin %" stroke={PURPLE} strokeWidth={2} dot={false} strokeDasharray="5 4" animationDuration={800} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* 3. Revenue by Client */}
        <ChartCard
          title="Revenue by Client"
          subtitle="Top 6 clients by invoiced revenue"
          delay={0.12}
          table={{
            head: ['Client', 'Revenue'],
            rows: revenueByClient.map((r) => [r.name, formatKES(r.revenue, { decimals: 0 })]),
          }}
        >
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueByClient} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF1F5" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#8494A7' }} tickLine={false} axisLine={false} tickFormatter={(v: number) => formatKESCompact(v).replace('KES ', '')} />
                <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fill: '#5B6B7C' }} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v: number) => [formatKES(v, { decimals: 0 }), 'Revenue']} contentStyle={{ borderRadius: 12, border: '1px solid #E4E9F0', fontSize: 12 }} />
                <Bar dataKey="revenue" fill={NAVY} radius={[0, 4, 4, 0]} barSize={18} animationDuration={800} label={{ position: 'right', fontSize: 11, fill: '#5B6B7C', formatter: (v: unknown) => formatKESCompact(Number(v)) }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* 4. Pipeline by Category */}
        <ChartCard
          title="Pipeline by Category"
          subtitle="Active tender value — Supplies / Works / Services"
          delay={0.16}
          table={{
            head: ['Category', 'Pipeline value'],
            rows: pipelineByCategory.map((r) => [r.name, formatKES(r.value, { decimals: 0 })]),
          }}
        >
          <div className="relative h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pipelineByCategory} dataKey="value" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={3} startAngle={90} endAngle={-270} animationDuration={800}>
                  {pipelineByCategory.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number, name: string) => [formatKES(v, { decimals: 0 }), name]} contentStyle={{ borderRadius: 12, border: '1px solid #E4E9F0', fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v: string) => <span className="text-app-slate">{v}</span>} verticalAlign="bottom" />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-x-0 top-[108px] text-center">
              <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-app-muted">Pipeline</div>
              <div className="text-lg font-bold text-app-ink tnum">{formatKESCompact(pipelineByCategory.reduce((a, x) => a + x.value, 0))}</div>
            </div>
          </div>
        </ChartCard>

        {/* 5. Collections Aging */}
        <ChartCard
          title="Collections Aging"
          subtitle="Outstanding invoice balances by days overdue"
          delay={0.2}
          table={{
            head: ['Client', 'Current', '1–30d', '31–60d', '60+d'],
            rows: agingData.map((r) => [r.client, formatKES(r.Current, { decimals: 0 }), formatKES(r['1–30'], { decimals: 0 }), formatKES(r['31–60'], { decimals: 0 }), formatKES(r['60+'], { decimals: 0 })]),
          }}
        >
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={agingData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF1F5" vertical={false} />
                <XAxis dataKey="client" tick={{ fontSize: 11, fill: '#8494A7' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#8494A7' }} tickLine={false} axisLine={false} tickFormatter={(v: number) => formatKESCompact(v).replace('KES ', '')} />
                <Tooltip formatter={(v: number, name: string) => [formatKES(v, { decimals: 0 }), name]} contentStyle={{ borderRadius: 12, border: '1px solid #E4E9F0', fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Current" stackId="a" fill={BLUE} animationDuration={800} />
                <Bar dataKey="1–30" stackId="a" fill={AMBER} animationDuration={800} />
                <Bar dataKey="31–60" stackId="a" fill="#EA580C" animationDuration={800} />
                <Bar dataKey="60+" stackId="a" fill={RED} radius={[4, 4, 0, 0]} animationDuration={800} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* 6. Officer Leaderboard */}
        <ChartCard title="Officer Leaderboard" subtitle="Tenders handled and won by officer" delay={0.24}>
          <div className="divide-y divide-[#EEF1F5]">
            {leaderboard.map((o, i) => (
              <div key={o.name} className="flex items-center gap-3 py-2.5">
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 18, delay: 0.3 + i * 0.1 }}
                  className="flex h-7 w-7 items-center justify-center"
                >
                  {i === 0 ? (
                    <Medal size={22} className="text-gold" />
                  ) : i === 1 ? (
                    <Medal size={20} className="text-[#94A3B8]" />
                  ) : i === 2 ? (
                    <Medal size={20} className="text-[#B45309]" />
                  ) : (
                    <span className="text-xs font-bold text-app-muted tnum">#{i + 1}</span>
                  )}
                </motion.span>
                <span className={cn('flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white', i === 0 ? 'bg-gold ring-2 ring-gold/30' : 'bg-navy-800')}>
                  {o.initials}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-app-ink">{o.name}</div>
                  <div className="text-xs text-app-muted">
                    {o.handled} tenders handled · {o.won} won
                  </div>
                </div>
                <div className="w-28">
                  <div className="mb-1 text-right text-xs font-semibold text-app-slate tnum">{o.winRate}%</div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[#EEF1F5]">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${o.winRate}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut', delay: 0.35 + i * 0.1 }}
                      className={cn('h-full rounded-full', i === 0 ? 'bg-gold' : 'bg-action')}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ChartCard>

        {/* 7. Compliance Health gauge */}
        <ChartCard title="Compliance Health" subtitle="Share of business documents currently valid" delay={0.28} className="xl:col-span-2">
          <ComplianceGauge pct={compliance.pct} renewals={compliance.renewals} state={state} />
        </ChartCard>
      </div>
    </div>
  );
}

/* ---------------- compliance radial gauge (animated arc + count-up) ---------------- */
function ComplianceGauge({ pct, renewals, state }: { pct: number; renewals: number; state: AppState }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true });
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, pct, { duration: 0.9, ease: 'easeOut', onUpdate: (v) => setShown(v) });
    return () => controls.stop();
  }, [inView, pct]);

  const R = 84;
  const CIRC = Math.PI * R; // semicircle
  const color = pct >= 70 ? GREEN : pct >= 40 ? AMBER : RED;

  return (
    <div ref={ref} className="flex flex-col items-center gap-6 md:flex-row md:justify-around">
      <div className="relative">
        <svg width="240" height="140" viewBox="0 0 240 140">
          <path d={`M 36 130 A ${R} ${R} 0 0 1 204 130`} fill="none" stroke="#EEF1F5" strokeWidth="18" strokeLinecap="round" />
          <path
            d={`M 36 130 A ${R} ${R} 0 0 1 204 130`}
            fill="none"
            stroke={color}
            strokeWidth="18"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - shown / 100)}
          />
        </svg>
        <div className="absolute inset-x-0 bottom-0 text-center">
          <div className="text-[34px] font-bold leading-9 text-app-ink tnum">{Math.round(shown)}%</div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-app-muted">documents valid</div>
        </div>
      </div>
      <div className="max-w-sm">
        <p className="text-sm text-app-slate">
          <span className={cn('font-semibold', renewals > 0 ? 'text-warning' : 'text-success')}>{renewals} document{renewals === 1 ? '' : 's'} need{renewals === 1 ? 's' : ''} renewal</span>{' '}
          within the next {state.settings.warningDays} days. Renew expiring licences and certificates before the next tender submission.
        </p>
        <div className="mt-3 space-y-1.5">
          {state.dms
            .filter((d) => d.expiryDate && daysUntil(d.expiryDate) <= state.settings.warningDays)
            .sort((a, b) => (a.expiryDate ?? '').localeCompare(b.expiryDate ?? ''))
            .map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 rounded-lg border border-app-border bg-app-bg px-3 py-1.5 text-xs">
                <span className="truncate font-medium text-app-ink">{d.title}</span>
                <span className="shrink-0 text-app-muted tnum">expires {formatDate(d.expiryDate)}</span>
              </div>
            ))}
        </div>
        <Link to="/dms" className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-action hover:text-action-hover">
          Review <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}
