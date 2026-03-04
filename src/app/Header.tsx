"use client";

import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { LogoutButton } from "@/components/LogoutButton";

export function Header() {
  const { data: session, status } = useSession();

  return (
    <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3">
      <Link
        href="/"
        className="outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
      >
        <Image
          src="/logo.png"
          alt="LifeSport Athletic Club"
          width={180}
          height={60}
          priority
          className="h-10 w-auto"
        />
      </Link>
      {status === "authenticated" && (
        <div className="flex items-center gap-3">
          {(session?.user as { role?: string })?.role === "TRAINER" && (
            <Link
              href="/dashboard"
              className="text-sm text-primary hover:text-primary-hover hover:underline outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
            >
              Dashboard
            </Link>
          )}
          <LogoutButton />
        </div>
      )}
    </header>
  );
}
