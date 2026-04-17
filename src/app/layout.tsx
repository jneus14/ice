import type { Metadata } from "next";
import "./globals.css";
import { ClientLayout } from "@/components/client-layout";

export const metadata: Metadata = {
  title: "Human Impact Project",
  description:
    "A living database documenting reported immigration enforcement incidents and their human impact.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
