import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, useInView, animate } from 'framer-motion';
import {
  FolderOpen, Send, Trophy, XCircle, Gauge, TrendingUp, Banknote, Landmark,
  FileWarning, FileSpreadsheet, FilePlus2, UserPlus, Upload, ChevronRight,
  AlertTriangle, MoreHorizontal, Layers,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area,
} from 'recharts';
import {
  useStore, computeKPIs, getNeedsAttention, getUpcomingDeadlines, daysUntil, TODAY,
  type AttentionItem, type TenderStatus,
} from '@/lib/store';
import { formatKES, formatKESCompact, formatDate } from '@/lib/format';
import { Pill, NewPill, CountdownChip, TimelineItem, StatChip, type Tone } from '@/components/shared';
import { cn } from '@/lib/utils';

/* ---------------- count-up ---------------- */
function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, value, {
      duration: 0.8,
      ease: 'easeOut',
      onUpdate: (v) => setDisplay(v),
    });
    return () => controls.stop();
  }, [inView, value]);
  return <span ref={ref}>{format(display)}</span>;
}

/* ---------------- chart card ---------------- */
function ChartCard({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  return (
    <div className={cn('rounded-xl border border-app-border bg-app-card p-4 shadow-card', className)}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[15px] font-semibold text-app-ink">{title}</h3>
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-app-muted hover:bg-app-bg"
            aria-label="Chart menu"
          >
            <MoreHorizontal size={16} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-8 z-10 w-40 rounded-xl border border-app-border bg-white p-1 shadow-card-hover" onMouseLeave={() => setMenuOpen(false)}>
              <button onClick={() => navigate('/reports')} className="w-full rounded-lg px-3 py-2 text-left text-[13px] text-app-ink hover:bg-app-bg">View report</button>
              <button onClick={() => setMenuOpen(false)} className="w-full rounded-lg px-3 py-2 text-left text-[13px] text-app-ink hover:bg-app-bg">Export PNG</button>
            </div>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

/* ---------------- constants ---------------- */
const PIPELINE_COLORS: Record<TenderStatus, string> = {
  Open: '#2563EB',
  Submitted: '#7C3AED',
  'Under Evaluation': '#C9A227',
  Won: '#16A34A',
  Lost: '#DC2626',
  Cancelled: '#94A3B8',
};
const PIPELINE_ORDER: TenderStatus[] = ['Open', 'Submitted', 'Under Evaluation', 'Won', 'Lost', 'Cancelled'];
const MONTHS = ['Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul']; // 2026-02 … 2026-07

const LEVEL_PILL: Record<AttentionItem['level'], { tone: Tone; label: string }> = {
  expired: { tone: 'red', label: 'Expired' },
  critical: { tone: 'red', label: 'Critical' },
  warning: { tone: 'amber', label: 'Warning' },
  pending: { tone: 'amber', label: 'Pending' },
};

type Period = 'month' | 'quarter' | 'year';

export default function Dashboard() {
  const state = useStore();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<Period>('year');

  const kpis = useMemo(() => computeKPIs(state), [state]);
  const attention = useMemo(() => getNeedsAttention(state), [state]);
  const deadlines = useMemo(() => getUpcomingDeadlines(state), [state]);
  const pendingApprovals = state.approvals.filter((a) => a.status === 'Pending').length;

  /* Pipeline by month (tender published month, stacked by status) */
  const pipelineData = useMemo(() => {
    const rows = MONTHS.map((m, i) => {
      const month = `2026-0${i + 2}`;
      const row: Record<string, number | string> = { month: m };
      PIPELINE_ORDER.forEach((st) => {
        row[st] = state.tenders
          .filter((t) => t.status === st && t.publishedDate.startsWith(month))
          .reduce((a, t) => a + t.value, 0);
      });
      return row;
    });
    return period === 'month' ? rows.slice(-1) : period === 'quarter' ? rows.slice(-3) : rows;
  }, [state.tenders, period]);

  /* Win / loss donut */
  const donut = useMemo(() => {
    const wonAmt = state.tenders.filter((t) => t.status === 'Won').reduce((a, t) => a + t.value, 0);
    const lostAmt = state.tenders.filter((t) => t.status === 'Lost').reduce((a, t) => a + t.value, 0);
    const inProgress = state.tenders.filter((t) => t.status === 'Open').reduce((a, t) => a + t.value, 0);
    return [
      { name: 'Won', value: wonAmt, color: '#16A34A' },
      { name: 'Lost', value: lostAmt, color: '#DC2626' },
      { name: 'In Progress', value: inProgress, color: '#C9A227' },
    ];
  }, [state.tenders]);

  /* Expected vs collected revenue (cumulative, from real records) */
  const revenueData = useMemo(() => {
    const docs = state.documents.filter((d) => d.type === 'contract' || d.type === 'invoice');
    let exp = 0;
    let col = 0;
    const rows = MONTHS.map((m, i) => {
      const month = `2026-0${i + 2}`;
      exp += docs.filter((d) => d.issueDate.startsWith(month)).reduce((a, d) => a + d.total, 0);
      col += state.payments.filter((p) => p.date.startsWith(month)).reduce((a, p) => a + p.amount, 0);
      return { month: m, Expected: Math.round(exp), Collected: Math.round(col) };
    });
    return period === 'month' ? rows.slice(-1) : period === 'quarter' ? rows.slice(-3) : rows;
  }, [state.documents, state.payments, period]);

  const clientName = (id?: string) => state.clients.find((c) => c.id === id)?.name ?? '';

  const kpiCards = [
    { label: 'Open Tenders', value: kpis.openTenders, icon: <FolderOpen size={18} />, variant: 'blue' as const, to: '/tenders?status=Open', fmt: (n: number) => `${Math.round(n)}` },
    { label: 'Submitted', value: kpis.submitted, icon: <Send size={18} />, variant: 'purple' as const, to: '/tenders?status=Submitted', fmt: (n: number) => `${Math.round(n)}` },
    { label: 'Won', value: kpis.won, icon: <Trophy size={18} />, variant: 'gold' as const, to: '/tenders?status=Won', fmt: (n: number) => `${Math.round(n)}` },
    { label: 'Lost', value: kpis.lost, icon: <XCircle size={18} />, variant: 'red' as const, to: '/tenders?status=Lost', fmt: (n: number) => `${Math.round(n)}` },
    { label: 'Success Rate', value: kpis.successRate, icon: <Gauge size={18} />, variant: 'green' as const, caption: `${kpis.won} won / ${kpis.lost} lost`, to: '/tenders', fmt: (n: number) => `${Math.round(n)}%` },
    { label: 'Pipeline Value', value: kpis.pipelineValue, icon: <Layers size={18} />, variant: 'blue' as const, to: '/tenders?status=Open', fmt: formatKESCompact },
    { label: 'Expected Revenue', value: kpis.expectedRevenue, icon: <TrendingUp size={18} />, variant: 'purple' as const, to: '/analytics', fmt: formatKESCompact },
    { label: 'Collected Revenue', value: kpis.collectedRevenue, icon: <Banknote size={18} />, variant: 'green' as const, to: '/payments', fmt: formatKESCompact },
    { label: 'Outstanding Balance', value: kpis.outstandingBalance, icon: <Landmark size={18} />, variant: 'gold' as const, caption: `Running contracts: ${kpis.runningContracts}`, to: '/payments', fmt: formatKESCompact },
    { label: 'Overdue Invoices', value: kpis.overdueInvoices, icon: <FileWarning size={18} />, variant: 'red' as const, to: '/payments?status=overdue', fmt: (n: number) => `${Math.round(n)}` },
  ];

  const quickActions = [
    { label: 'Bulk Upload Centre', icon: <FileSpreadsheet size={18} />, to: '/bulk-upload', isNew: true },
    { label: 'New Quotation', icon: <FilePlus2 size={18} />, to: '/documents/new/quotation' },
    { label: 'Add Client', icon: <UserPlus size={18} />, to: '/clients?new=1' },
    { label: 'Add Business Document', icon: <Upload size={18} />, to: '/dms?new=1' },
  ];

  const container = { animate: { transition: { staggerChildren: 0.06 } } };
  const item = {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' as const } },
  };

  return (
    <motion.div variants={container} initial="initial" animate="animate" className="px-7 pb-8 pt-6">
      {/* 1. Page header */}
      <motion.div variants={item} className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold text-app-ink">Dashboard</h1>
          <p className="mt-1 text-sm text-app-slate">
            Welcome back, Admin — here's today at Future Bright Ventures.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-app-border bg-white p-1 shadow-card">
            {(['month', 'quarter', 'year'] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={cn(
                  'relative rounded-md px-3.5 py-1.5 text-[13px] font-semibold transition-colors',
                  period === p ? 'text-white' : 'text-app-slate hover:text-app-ink',
                )}
              >
                {period === p && (
                  <motion.span
                    layoutId="period-pill"
                    transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                    className="absolute inset-0 rounded-md bg-action"
                  />
                )}
                <span className="relative">{p === 'month' ? 'This Month' : p === 'quarter' ? 'Quarter' : 'Year'}</span>
              </button>
            ))}
          </div>
          <Link
            to="/tenders?new=1"
            className="flex h-9 items-center gap-1.5 rounded-lg bg-action px-4 text-[13px] font-semibold text-white shadow-card transition hover:-translate-y-px hover:bg-action-hover active:scale-[.98]"
          >
            + New Tender
          </Link>
        </div>
      </motion.div>

      {/* 2. KPI grid — 2 rows × 5 */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {kpiCards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: i * 0.05, ease: 'easeOut' }}
          >
            <StatChip
              icon={card.icon}
              label={card.label}
              value={<CountUp value={card.value} format={card.fmt} />}
              caption={card.caption}
              variant={card.variant}
              onClick={() => navigate(card.to)}
            />
          </motion.div>
        ))}
      </div>

      {/* 3. Quick actions (v2.0) */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {quickActions.map((qa, i) => (
          <motion.button
            key={qa.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.15 + i * 0.05, ease: 'easeOut' }}
            onClick={() => navigate(qa.to)}
            className="group flex h-16 items-center gap-3 rounded-xl border border-app-border bg-app-card px-4 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-card-hover"
          >
            <span
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
                qa.isNew
                  ? 'bg-gold-soft text-gold group-hover:bg-gold group-hover:text-navy-950'
                  : 'bg-info-soft text-info group-hover:bg-action group-hover:text-white',
              )}
            >
              {qa.icon}
            </span>
            <span className="flex-1 text-sm font-semibold text-app-ink">{qa.label}</span>
            {qa.isNew && <NewPill />}
            <ChevronRight size={16} className="text-app-muted transition-transform duration-150 group-hover:translate-x-[3px]" />
          </motion.button>
        ))}
      </div>

      {/* 4. Charts row */}
      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[2fr_1fr]">
        <ChartCard title="Tender Pipeline by Month">
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart key={`bar-${period}`} data={pipelineData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF1F5" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#8494A7' }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 11, fill: '#8494A7' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => (v ? `KES ${(v / 1e6).toFixed(1)}M` : '0')}
                  width={86}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(37,99,235,.05)' }}
                  formatter={(value: number, name: string) => [formatKES(value), name]}
                  contentStyle={{ borderRadius: 12, border: '1px solid #E4E9F0', fontSize: 13 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {PIPELINE_ORDER.map((st, i) => (
                  <Bar
                    key={st}
                    dataKey={st}
                    stackId="pipeline"
                    fill={PIPELINE_COLORS[st]}
                    radius={i === PIPELINE_ORDER.length - 1 ? [4, 4, 0, 0] : 0}
                    isAnimationActive
                    animationDuration={800}
                    animationBegin={i * 60}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Win / Loss">
          <div className="relative h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart key={`pie-${period}`}>
                <Pie
                  data={donut}
                  dataKey="value"
                  innerRadius={72}
                  outerRadius={100}
                  paddingAngle={2}
                  startAngle={90}
                  endAngle={-270}
                  animationDuration={900}
                >
                  {donut.map((d) => (
                    <Cell key={d.name} fill={d.color} stroke="none" />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number, name: string) => [formatKES(value), name]} contentStyle={{ borderRadius: 12, border: '1px solid #E4E9F0', fontSize: 13 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-1">
              <span className="text-[28px] font-bold text-app-ink tnum">
                <CountUp value={kpis.successRate} format={(n) => `${Math.round(n)}%`} />
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-app-muted">Success Rate</span>
            </div>
          </div>
          <div className="mt-1 space-y-1.5 border-t border-app-border pt-3">
            {donut.map((d) => (
              <div key={d.name} className="flex items-center justify-between text-[13px]">
                <span className="flex items-center gap-2 text-app-slate">
                  <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
                  {d.name}
                </span>
                <span className="font-medium text-app-ink tnum">{formatKES(d.value)}</span>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>

      {/* 5. Bottom grid */}
      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[3fr_2fr]">
        {/* left column */}
        <div className="space-y-5">
          <ChartCard title="Expected vs Collected Revenue">
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart key={`area-${period}`} data={revenueData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="collectedFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgba(37,99,235,.18)" />
                      <stop offset="100%" stopColor="rgba(37,99,235,.02)" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EEF1F5" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#8494A7' }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#8494A7' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => (v ? `KES ${(v / 1e6).toFixed(1)}M` : '0')}
                    width={86}
                  />
                  <Tooltip formatter={(value: number, name: string) => [formatKES(value), name]} contentStyle={{ borderRadius: 12, border: '1px solid #E4E9F0', fontSize: 13 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="Expected" stroke="#1F3B57" strokeWidth={2.5} fill="transparent" animationDuration={800} />
                  <Area type="monotone" dataKey="Collected" stroke="#2563EB" strokeWidth={2.5} fill="url(#collectedFill)" animationDuration={800} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          {/* Recent activity */}
          <div className="rounded-xl border border-app-border bg-app-card p-4 shadow-card">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-app-ink">Recent Activity</h3>
              <Link to="/audit" className="text-[13px] font-medium text-action hover:underline">
                View audit trail
              </Link>
            </div>
            <div className="divide-y divide-transparent">
              {state.activity.slice(0, 6).map((entry, i) => (
                <TimelineItem key={entry.id} entry={entry} index={i} />
              ))}
            </div>
          </div>
        </div>

        {/* right column */}
        <div className="space-y-5">
          {/* Needs attention */}
          <div className="rounded-xl border border-app-border bg-app-card p-4 shadow-card">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-[15px] font-semibold text-danger">
                <AlertTriangle size={16} />
                Needs Attention
              </h3>
              <Pill tone="amber">{pendingApprovals} approvals</Pill>
            </div>
            <div className="space-y-2">
              {attention.slice(0, 6).map((att, i) => {
                const pill = LEVEL_PILL[att.level];
                return (
                  <motion.button
                    key={att.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25, delay: i * 0.04 }}
                    onClick={() => navigate(att.route)}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 rounded-lg border border-app-border bg-white px-3 py-2.5 text-left transition hover:bg-app-bg',
                      (att.level === 'expired' || att.level === 'critical') && 'border-l-[3px] border-l-danger',
                    )}
                  >
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-app-muted">{att.kind}</div>
                      <div className="truncate text-[13px] font-medium text-app-ink">{att.label}</div>
                    </div>
                    <Pill tone={pill.tone} pulse={att.level === 'critical'}>{pill.label}</Pill>
                  </motion.button>
                );
              })}
              {attention.length === 0 && (
                <div className="py-6 text-center text-sm text-app-muted">All clear — nothing needs attention.</div>
              )}
            </div>
          </div>

          {/* Upcoming deadlines */}
          <div className="rounded-xl border border-app-border bg-app-card p-4 shadow-card">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-app-ink">Upcoming Deadlines</h3>
              <Link to="/deadlines" className="text-[13px] font-medium text-action hover:underline">
                View all →
              </Link>
            </div>
            <div className="divide-y divide-[#EEF1F5]">
              {deadlines.slice(0, 5).map((ddl, i) => {
                const overdue = daysUntil(ddl.date) < 0;
                return (
                  <motion.div
                    key={ddl.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25, delay: i * 0.04 }}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-medium text-app-ink">{ddl.title}</div>
                      <div className="text-xs text-app-muted">
                        {ddl.clientName ?? clientName(ddl.clientId)} · {formatDate(ddl.date)}
                      </div>
                    </div>
                    <CountdownChip date={ddl.date} pulse={overdue} className={cn(!overdue && 'font-semibold')} />
                  </motion.div>
                );
              })}
              {deadlines.length === 0 && (
                <div className="py-6 text-center text-sm text-app-muted">No open deadlines.</div>
              )}
            </div>
            <div className="mt-2 text-right text-xs text-app-muted tnum">Today: {formatDate(TODAY)}</div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
