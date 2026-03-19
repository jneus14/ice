"use client";

import { ReactNode } from "react";
import Image from "next/image";
import { LanguageProvider, useLanguage, type Lang } from "@/lib/i18n";

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
    <header className="bg-gradient-to-br from-warm-900 via-warm-800 to-stone-900 text-white relative overflow-hidden">
      <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'1\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }} />
      <div className="max-w-6xl mx-auto px-6 py-12 relative">
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
          <LanguageToggle />
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
