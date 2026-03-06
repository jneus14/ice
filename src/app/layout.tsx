import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ICE Incident Tracker",
  description: "Documenting immigration enforcement incidents across the United States",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header className="border-b border-warm-200">
          <div className="max-w-6xl mx-auto px-4 py-6">
            <a href="/" className="block">
              <h1 className="text-2xl font-bold tracking-tight">
                ICE Incident Tracker
              </h1>
              <p className="text-sm text-warm-500 mt-1">
                Documenting immigration enforcement incidents
              </p>
            </a>
          </div>
        </header>
        <main className="max-w-6xl mx-auto px-4 py-8">
          {children}
        </main>
        <footer className="border-t border-warm-200 mt-16">
          <div className="max-w-6xl mx-auto px-4 py-6 text-sm text-warm-400">
            Data sourced from public reporting.
          </div>
        </footer>
      </body>
    </html>
  );
}
