"use client";

import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { LogoutButton } from "@/components/LogoutButton";

export function Header() {
  const { data: session, status } = useSession();

  const isTrainer = status === "authenticated" && (session?.user as { role?: string })?.role === "TRAINER";

  return (
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface px-4 py-3 md:gap-4">
      <div className="flex flex-wrap items-center gap-2 md:gap-4">
        <Link
          href="/"
          className="outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded shrink-0"
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
        {isTrainer && (
          <Link
            href="/manage-account"
            className="text-xs text-primary hover:text-primary-hover hover:underline outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded md:text-sm whitespace-normal md:whitespace-nowrap"
          >
            Manage My Account
          </Link>
        )}
      </div>
      {isTrainer && (
        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          <Link
            href="/dashboard"
            className="text-xs text-primary hover:text-primary-hover hover:underline outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded md:text-sm whitespace-normal md:whitespace-nowrap"
          >
            Dashboard
          </Link>
          <Link
            href="/dashboard/manage-accounts"
            className="text-xs text-primary hover:text-primary-hover hover:underline outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded md:text-sm whitespace-normal md:whitespace-nowrap"
          >
            Manage Client Accounts
          </Link>
          <LogoutButton className="px-3 py-2 text-xs md:px-4 md:py-2 md:text-sm" />
        </div>
      )}
    </header>
  );
}
