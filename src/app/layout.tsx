import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Header } from "./Header";
import { FocusScroll } from "@/components/FocusScroll";

export const metadata: Metadata = {
  title: "Workout Tracker",
  description: "Personal trainer client and session tracking",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-[100dvh] h-[100dvh] flex flex-col bg-background text-[var(--text)] antialiased overflow-hidden">
        <Providers>
          <FocusScroll />
          <Header />
          {/* Main content is the single scroll container. min-h-0 lets this flex child shrink so overflow-y-auto scrolls. */}
          <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
            <div className="mx-auto max-w-4xl px-4 py-6 pb-24">{children}</div>
          </main>
        </Providers>
      </body>
    </html>
  );
}
