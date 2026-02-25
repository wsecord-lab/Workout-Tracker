import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Header } from "./Header";
import { initSqlitePragmas } from "@/lib/db";

export const metadata: Metadata = {
  title: "Workout Tracker",
  description: "Personal trainer client and session tracking",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await initSqlitePragmas();
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-[var(--text)] antialiased">
        <Providers>
          <Header />
          <main className="mx-auto max-w-4xl px-4 py-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
