import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

/** Split-screen sign-in (placeholder logic — demo credentials accepted). */
export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@fbv.co.ke');
  const [password, setPassword] = useState('demo1234');

  return (
    <div className="flex min-h-[100dvh] bg-navy-950">
      {/* Brand panel */}
      <div
        className="relative hidden w-[46%] flex-col justify-between overflow-hidden p-10 lg:flex"
        style={{ backgroundImage: 'url(/login-bg.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}
      >
        <div className="absolute inset-0 bg-navy-950/35" />
        <div className="relative flex items-center gap-3">
          <img src="/logo.svg" alt="FBV" className="h-10 w-10 rounded-lg" />
          <div>
            <div className="text-sm font-semibold text-white">Future Bright</div>
            <div className="text-[10px] font-bold tracking-[0.18em] text-gold">VENTURES LTD</div>
          </div>
        </div>
        <div className="relative">
          <h1 className="max-w-md text-[34px] font-bold leading-tight text-white">
            Tender &amp; Contract Management, Done Right.
          </h1>
          <p className="mt-3 max-w-sm text-sm leading-6 text-white/70">
            Track tenders, generate documents, watch deadlines and keep every business licence current — in one Kenyan-built ERP.
          </p>
        </div>
        <div className="relative text-xs text-white/50">© 2026 Future Bright Ventures Ltd · Nairobi, Kenya</div>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center bg-white px-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="w-full max-w-sm"
        >
          <img src="/logo.svg" alt="FBV" className="mb-6 h-12 w-12 rounded-xl lg:hidden" />
          <h2 className="text-2xl font-bold text-app-ink">Sign in</h2>
          <p className="mt-1 text-sm text-app-slate">FBV Tender &amp; Contract Management System v2.0</p>

          <form
            className="mt-7 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              navigate('/');
            }}
          >
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-app-ink">Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-[42px] w-full rounded-lg border border-app-border px-3 text-sm outline-none transition focus:border-action focus:ring-2 focus:ring-[rgba(37,99,235,.25)]"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-app-ink">Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-[42px] w-full rounded-lg border border-app-border px-3 text-sm outline-none transition focus:border-action focus:ring-2 focus:ring-[rgba(37,99,235,.25)]"
              />
            </label>
            <button
              type="submit"
              className="h-[42px] w-full rounded-lg bg-action text-sm font-semibold text-white transition hover:-translate-y-px hover:bg-action-hover active:scale-[.98]"
            >
              Sign in
            </button>
          </form>

          <div className="mt-6 rounded-lg border border-gold/40 bg-gold-soft px-4 py-3 text-xs leading-5 text-navy-800">
            <span className="font-semibold">Demo credentials</span> are pre-filled — just press Sign in.
          </div>
        </motion.div>
      </div>
    </div>
  );
}
