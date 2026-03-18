"use client";

import { useLanguage } from "@/lib/i18n";

export default function NotFound() {
  const { t } = useLanguage();
  return (
    <div className="py-24 text-center">
      <h2 className="text-2xl font-serif font-bold">{t.pageNotFound}</h2>
      <p className="mt-2 text-warm-500">
        <a href="/" className="underline hover:text-warm-900">
          {t.returnHome}
        </a>
      </p>
    </div>
  );
}
