import type { Metadata } from "next";
import Image from "next/image";
import "./globals.css";

export const metadata: Metadata = {
  title: "Human Impact Project",
  description:
    "A living database documenting reported incidents of harm related to U.S. Immigration and Customs Enforcement operations.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
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
              <span className="text-xs text-gray-400 tracking-wide uppercase font-medium">A project of</span>
              <Image
                src="/humsi-logo.png"
                alt="HUMSI — Human Security Initiative"
                width={90}
                height={36}
                className="object-contain"
                priority
              />
            </a>
          </div>
        </div>

        <header className="bg-warm-900 text-white">
          <div className="max-w-6xl mx-auto px-6 py-10">
            <a href="/" className="block">
              <h1 className="text-4xl font-bold tracking-tight font-serif">
                Human Impact Project
              </h1>
              <p className="text-warm-400 mt-2 text-base leading-relaxed max-w-3xl">
                A living database documenting reported incidents of harm related
                to U.S. Immigration and Customs Enforcement operations.
              </p>
            </a>
          </div>
        </header>
        <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
        <footer className="border-t border-warm-200 mt-16">
          <div className="max-w-6xl mx-auto px-6 py-6 text-sm text-warm-400">
            Data sourced from public reporting.
          </div>
        </footer>
      </body>
    </html>
  );
}
