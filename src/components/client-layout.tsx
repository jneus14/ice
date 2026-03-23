"use client";

import { ReactNode, useState } from "react";
import Image from "next/image";
import { LanguageProvider, useLanguage, type Lang } from "@/lib/i18n";

function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit() {
    if (!message.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message }),
      });
      if (res.ok) {
        setSent(true);
        setMessage("");
        setName("");
        setEmail("");
        setTimeout(() => { setSent(false); setOpen(false); }, 2000);
      }
    } catch {}
    setSending(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 text-sm font-medium rounded-md border border-warm-300 text-warm-600 hover:bg-warm-50 transition-colors"
      >
        Leave Feedback
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl p-5 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-warm-900">Leave Feedback</h3>
              <button onClick={() => setOpen(false)} className="text-warm-400 hover:text-warm-700 text-lg">✕</button>
            </div>
            {sent ? (
              <div className="py-8 text-center">
                <p className="text-green-600 font-semibold text-lg">Thank you for your feedback!</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-warm-500 mb-1">Name (optional)</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-warm-300 text-sm focus:outline-none focus:border-warm-500"
                      placeholder="Your name"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-warm-500 mb-1">Email (optional)</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-warm-300 text-sm focus:outline-none focus:border-warm-500"
                      placeholder="you@email.com"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-warm-500 mb-1">Message *</label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 rounded-lg border border-warm-300 text-sm focus:outline-none focus:border-warm-500 resize-y"
                    placeholder="Share your thoughts, suggestions, or report an issue..."
                  />
                </div>
                <button
                  onClick={handleSubmit}
                  disabled={sending || !message.trim()}
                  className="w-full py-2.5 bg-warm-800 text-white font-medium rounded-lg hover:bg-warm-900 transition-colors disabled:opacity-40"
                >
                  {sending ? "Sending..." : "Send Feedback"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function LanguageToggle() {
  const { lang, setLang } = useLanguage();

  if (lang === "en") {
    return (
      <button
        onClick={() => setLang("es")}
        className="px-3 py-1.5 text-sm font-medium rounded-md bg-amber-500 text-white hover:bg-amber-600 transition-colors shadow-sm"
      >
        🌐 Ver en Español
      </button>
    );
  }

  return (
    <button
      onClick={() => setLang("en")}
      className="px-3 py-1.5 text-sm font-medium rounded-md bg-amber-500 text-white hover:bg-amber-600 transition-colors shadow-sm"
    >
      🌐 View in English
    </button>
  );
}

function SiteHeader() {
  const { t } = useLanguage();
  return (
    <header className="bg-warm-900 text-white">
      <div className="max-w-6xl mx-auto px-6 py-7">
        <a href="/" className="block group">
          <h1 className="text-5xl font-bold tracking-tight font-serif bg-gradient-to-r from-white via-orange-100 to-amber-200 bg-clip-text text-transparent drop-shadow-sm py-1 leading-normal">
            {t.siteTitle}
          </h1>
          <p className="text-warm-300 mt-3 text-lg leading-relaxed max-w-3xl font-light tracking-wide">
            {t.siteDescription}
          </p>
        </a>
      </div>
    </header>
  );
}

function SiteFooter() {
  const { t } = useLanguage();
  return (
    <footer className="border-t border-warm-200 mt-16">
      <div className="max-w-6xl mx-auto px-6 py-6 text-sm text-warm-400">
        {t.footerText}
      </div>
    </footer>
  );
}

function Inner({ children }: { children: ReactNode }) {
  const { t } = useLanguage();
  return (
    <>
      {/* HUMSI branding strip */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FeedbackButton />
            <LanguageToggle />
            <a
              href="https://secure.givelively.org/donate/human-security-initiative"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 text-sm font-medium rounded-md bg-purple-600 text-white hover:bg-purple-700 transition-colors shadow-sm"
            >
              Support Our Work
            </a>
          </div>
          <a
            href="https://humsi.org"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 opacity-80 hover:opacity-100 transition-opacity"
            aria-label="Human Security Initiative"
          >
            <span className="text-xs text-gray-400 tracking-wide uppercase font-medium">
              {t.projectOf}
            </span>
            <Image
              src="/humsi-logo.png"
              alt="HUMSI — Human Security Initiative"
              width={120}
              height={48}
              className="object-contain"
              priority
            />
          </a>
        </div>
      </div>
      <SiteHeader />
      <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
      <SiteFooter />
    </>
  );
}

export function ClientLayout({ children }: { children: ReactNode }) {
  return (
    <LanguageProvider>
      <Inner>{children}</Inner>
    </LanguageProvider>
  );
}
