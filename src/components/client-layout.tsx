"use client";

import { ReactNode } from "react";
import Image from "next/image";
import { LanguageProvider, useLanguage, type Lang } from "@/lib/i18n";

function LanguageToggle() {
  const { lang, setLang } = useLanguage();
  return (
    <div className="flex items-center gap-0.5 ml-4">
      {(["en", "es"] as Lang[]).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          className={`px-2 py-0.5 text-xs font-medium rounded transition-colors ${
            lang === l
              ? "bg-warm-800 text-white"
              : "text-warm-400 hover:text-warm-700"
          }`}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function SiteHeader() {
  const { t } = useLanguage();
  return (
    <header className="bg-warm-900 text-white">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <a href="/" className="block">
          <h1 className="text-4xl font-bold tracking-tight font-serif">
            {t.siteTitle}
          </h1>
          <p className="text-warm-400 mt-2 text-base leading-relaxed max-w-3xl">
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
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-end">
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
              width={90}
              height={36}
              className="object-contain"
              priority
            />
          </a>
          <LanguageToggle />
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
