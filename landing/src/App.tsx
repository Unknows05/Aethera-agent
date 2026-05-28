import { useState, useEffect } from 'react';
import { Menu, X, ChevronRight, ExternalLink } from 'lucide-react';
import BoomerangVideoBg from './BoomerangVideoBg';

const BG_VIDEO =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260511_131941_d136af49-e243-493a-be14-6ff3f24e09e6.mp4';

const features = [
  {
    title: 'Multi-Agent Orchestrator',
    desc: 'LLM hunter + healer cycle. Hunter screens and enters positions; healer monitors and adjusts. Dynamic model selection via OpenRouter with auto-fallback.',
  },
  {
    title: 'Quant Screening Engine',
    desc: '7 indicators across 3 timeframes with TF-weighted scoring. ADX-based regime detection, orderbook microstructure, and confidence calibration.',
  },
  {
    title: 'Self-Learning Evolution',
    desc: 'Post-turn review, Darwinian weight adjustment, and a lessons database. The agent gets smarter the longer it runs.',
  },
  {
    title: 'Hivemind Network',
    desc: 'Shared signals, aggregated global weights, and crowd wisdom. Every agent learns from every other agent in the swarm.',
  },
];

const steps = [
  { num: '01', title: 'Setup', desc: 'Configure your Binance API key, pick an OpenRouter model, and set your risk parameters in a single YAML file.' },
  { num: '02', title: 'Start', desc: 'Run one command. The agent screens, trades, and monitors 24/7 — no need to babysit.' },
  { num: '03', title: 'Evolve', desc: 'Each cycle refines strategy weights. Over weeks, the agent builds institutional-grade market intuition.' },
];

const specs = [
  { label: 'Runtime', value: 'Node.js 20+ / Bun 1.0+' },
  { label: 'LLM Gateway', value: 'OpenRouter (DeepSeek, Gemini, Claude)' },
  { label: 'Storage', value: 'SQLite (FTS5), JSON' },
  { label: 'TUI', value: 'Ink + React (terminal UI)' },
  { label: 'Exchange', value: 'Binance Futures (USDT, COIN-M)' },
  { label: 'License', value: 'MIT — 100% open source' },
];

function App() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  const navLinks = [
    { href: '/features', label: 'Features' },
    { href: '/install', label: 'Install' },
    { href: '/docs/', label: 'Docs' },
    { href: 'https://hivemind.aethera-s1.com', label: 'Hivemind', external: true },
    { href: 'https://github.com/Unknows05/Aethera-agent', label: 'GitHub', external: true },
  ];

  return (
    <div className="bg-[#0e130e] text-[#e8eee3]">
      {/* ===== NAV ===== */}
      <nav className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 sm:px-6 md:px-10 py-4 sm:py-5 bg-[#0e130e]/80 backdrop-blur-md border-b border-white/5">
        <a href="/" className="flex items-center gap-2 text-[#e8eee3] no-underline">
          <span className="text-lg sm:text-xl font-semibold tracking-tight">
            Aethera<sup className="text-[10px] sm:text-xs font-medium text-[#85AB8B]">Agent</sup>
          </span>
        </a>

        <div className="hidden lg:flex items-center gap-1">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target={link.external ? '_blank' : undefined}
              rel={link.external ? 'noopener noreferrer' : undefined}
              className="text-sm px-3 py-2 text-[#9baa95] hover:text-[#e8eee3] transition-colors duration-200 no-underline hover-underline"
            >
              {link.label}
              {link.external && <ExternalLink className="inline w-3 h-3 ml-1 opacity-50" />}
            </a>
          ))}
          <a href="/install" className="ml-3 bg-[#85AB8B] hover:bg-[#9bc0a1] text-[#0e130e] text-sm font-semibold px-5 py-2.5 rounded-full transition-all duration-200 no-underline hover-glow">
            Install
          </a>
        </div>

        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="lg:hidden relative flex items-center justify-center w-10 h-10 rounded-full bg-white/10 text-[#e8eee3] transition-all duration-300 hover:bg-white/20"
          aria-label={menuOpen ? 'Close' : 'Menu'}
        >
          <Menu className={`w-5 h-5 absolute transition-all duration-300 ${menuOpen ? 'opacity-0 rotate-90 scale-50' : 'opacity-100 rotate-0 scale-100'}`} />
          <X className={`w-5 h-5 absolute transition-all duration-300 ${menuOpen ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-50'}`} />
        </button>
      </nav>

      {/* Mobile drawer */}
      <div className={`lg:hidden fixed inset-0 z-30 transition-opacity duration-300 ${menuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} onClick={() => setMenuOpen(false)}>
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      </div>
      <div className={`lg:hidden fixed top-0 right-0 bottom-0 z-30 w-[85%] max-w-sm bg-[#141a13] border-l border-white/5 shadow-2xl transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${menuOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex flex-col h-full pt-24 px-8 pb-8">
          {navLinks.map((link, i) => (
            <a
              key={link.href}
              href={link.href}
              target={link.external ? '_blank' : undefined}
              onClick={() => setMenuOpen(false)}
              className={`text-2xl font-semibold text-[#e8eee3] py-4 border-b border-white/5 transition-all duration-500 no-underline ${menuOpen ? 'translate-x-0 opacity-100' : 'translate-x-8 opacity-0'}`}
              style={{ transitionDelay: menuOpen ? `${150 + i * 70}ms` : '0ms' }}
            >
              {link.label}
              {link.external && <ExternalLink className="inline w-5 h-5 ml-2 opacity-50" />}
            </a>
          ))}
          <a href="/install" onClick={() => setMenuOpen(false)} className="mt-6 bg-[#85AB8B] text-[#0e130e] font-semibold px-5 py-3 rounded-full text-center transition-all no-underline hover-glow">
            Install Now
          </a>
        </div>
      </div>

      {/* ===== HERO ===== */}
      <section className="relative w-full min-h-screen flex items-center overflow-hidden">
        <BoomerangVideoBg src={BG_VIDEO} className="absolute inset-0 w-full h-full" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0e130e]/70 via-[#0e130e]/40 to-[#0e130e]/95 z-[1]" />
        <div className="relative z-10 w-full px-4 sm:px-6 md:px-10 pt-24 pb-20">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 bg-[#85AB8B]/10 border border-[#85AB8B]/20 rounded-full px-4 py-1.5 mb-6 hover:bg-[#85AB8B]/15 transition-colors">
              <span className="w-1.5 h-1.5 rounded-full bg-[#85AB8B] animate-pulse" />
              <span className="text-xs font-medium text-[#85AB8B] tracking-wide uppercase">v1.0 — Autonomous AI Trading</span>
            </div>
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-normal leading-[1.05] tracking-tight">
              Let Your{' '}
              <span className="text-[#85AB8B]">AI Trade</span>
              <br />
              While You Sleep
            </h1>
            <p className="mt-5 text-base sm:text-lg text-[#9baa95] leading-relaxed max-w-lg mx-auto">
              AI-powered trading agent for Binance Futures. Self-learning via LLM orchestrator, quant screening, and swarm intelligence — running 24/7 in your terminal.
            </p>
            <div className="mt-8 flex items-center justify-center gap-4 flex-wrap">
              <a href="/install" className="inline-flex items-center gap-2 bg-[#85AB8B] hover:bg-[#9bc0a1] text-[#0e130e] font-semibold px-6 py-3 rounded-full transition-all duration-200 no-underline hover-glow">
                Start Now <ChevronRight className="w-4 h-4" />
              </a>
              <a href="/features" className="inline-flex items-center gap-1 text-[#9baa95] hover:text-[#e8eee3] transition-colors duration-200 no-underline text-sm hover-underline">
                Explore Features
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FEATURES ===== */}
      <section id="features" className="px-4 sm:px-6 md:px-10 py-24 md:py-32 max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-normal tracking-tight">Capabilities</h2>
          <p className="mt-3 text-[#9baa95] text-sm sm:text-base">Four engines that work together as a single autonomous system</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-4 sm:gap-5">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border border-white/5 bg-white/[0.02] p-6 sm:p-7 hover-card text-center">
              <h3 className="text-lg font-semibold mb-2 text-[#e8eee3]">{f.title}</h3>
              <p className="text-sm text-[#9baa95] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section className="px-4 sm:px-6 md:px-10 py-24 md:py-32 max-w-5xl mx-auto border-t border-white/5">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-normal tracking-tight">How It Works</h2>
          <p className="mt-3 text-[#9baa95] text-sm sm:text-base">Three steps from zero to autonomous trading</p>
        </div>
        <div className="grid sm:grid-cols-3 gap-8 sm:gap-6">
          {steps.map((s) => (
            <div key={s.num} className="text-center hover-lift p-4 rounded-lg">
              <span className="text-3xl font-light text-[#85AB8B]/40 block mb-3">{s.num}</span>
              <h3 className="text-lg font-semibold mb-2">{s.title}</h3>
              <p className="text-sm text-[#9baa95] leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== ARCHITECTURE ===== */}
      <section className="px-4 sm:px-6 md:px-10 py-24 md:py-32 max-w-5xl mx-auto border-t border-white/5">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-normal tracking-tight">Architecture</h2>
          <p className="mt-3 text-[#9baa95] text-sm sm:text-base">End-to-end flow from your terminal to the exchange</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 text-sm">
          {['You', 'CLI / TUI', 'Agent Core', 'LLM (OpenRouter)', 'Binance Futures'].map((label, i) => (
            <div key={label} className="flex items-center gap-3 sm:gap-4">
              <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-[#e8eee3] font-medium hover-card cursor-default">
                {label}
              </div>
              {i < 4 && <ChevronRight className="w-4 h-4 text-[#85AB8B]/40 flex-shrink-0" />}
            </div>
          ))}
        </div>
      </section>

      {/* ===== TECH SPECS ===== */}
      <section className="px-4 sm:px-6 md:px-10 py-24 md:py-32 max-w-5xl mx-auto border-t border-white/5">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-normal tracking-tight">Technical Specs</h2>
          <p className="mt-3 text-[#9baa95] text-sm sm:text-base">What powers the agent under the hood</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {specs.map((s) => (
            <div key={s.label} className="rounded-lg border border-white/5 bg-white/[0.02] px-5 py-4 hover-card">
              <div className="text-xs text-[#85AB8B] font-medium uppercase tracking-wider mb-1">{s.label}</div>
              <div className="text-sm text-[#e8eee3]">{s.value}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="px-4 sm:px-6 md:px-10 py-24 md:py-32 max-w-3xl mx-auto text-center border-t border-white/5">
        <h2 className="text-3xl sm:text-4xl font-normal tracking-tight mb-4">Start Trading Autonomously</h2>
        <p className="text-[#9baa95] text-sm sm:text-base mb-8 max-w-md mx-auto">
          100% open source. No subscription. You only pay for the LLM API calls.
        </p>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <a href="/install" className="inline-flex items-center gap-2 bg-[#85AB8B] hover:bg-[#9bc0a1] text-[#0e130e] font-semibold px-6 py-3 rounded-full transition-all duration-200 no-underline hover-glow">
            Install Now <ChevronRight className="w-4 h-4" />
          </a>
          <a href="https://github.com/Unknows05/Aethera-agent" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 border border-white/10 text-[#9baa95] hover:text-[#e8eee3] hover:border-white/20 px-6 py-3 rounded-full transition-all duration-200 no-underline">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
            GitHub
          </a>
        </div>
        <p className="mt-6 text-xs text-[#6b7d65]">Built for traders, by traders.</p>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="px-4 sm:px-6 md:px-10 py-8 border-t border-white/5 text-center text-xs text-[#6b7d65]">
        <div className="flex items-center justify-center gap-4 flex-wrap mb-4">
          <a href="/features" className="hover:text-[#9baa95] transition-colors no-underline">Features</a>
          <a href="/install" className="hover:text-[#9baa95] transition-colors no-underline">Install</a>
          <a href="/docs/" className="hover:text-[#9baa95] transition-colors no-underline">Docs</a>
          <a href="https://github.com/Unknows05/Aethera-agent" target="_blank" rel="noopener noreferrer" className="hover:text-[#9baa95] transition-colors no-underline">GitHub</a>
        </div>
        <p>Aethera Agent — MIT License</p>
      </footer>
    </div>
  );
}

export default App;
