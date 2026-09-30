"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { LogoutButton } from "@/components/LogoutButton";
import { TemplatesManagerModal } from "@/components/TemplatesManagerModal";

export function Header() {
  const { data: session, status } = useSession();
  const [templatesOpen, setTemplatesOpen] = useState(false);

  const role = (session?.user as { role?: string })?.role;
  const isTrainer = status === "authenticated" && role === "TRAINER";
  const isClient = status === "authenticated" && role === "CLIENT";
  const clientProfileId =
    (session?.user as { clientProfileId?: string | null })?.clientProfileId ?? null;

  const clientNavLinkClass =
    "text-xs text-primary hover:text-primary-hover hover:underline outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded md:text-sm whitespace-normal md:whitespace-nowrap";

  return (
    <>
      <header className="shrink-0 flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface px-4 py-3 md:gap-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 md:gap-x-4">
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
          {isClient && clientProfileId && (
            <nav
              className="flex flex-wrap items-center gap-x-3 gap-y-1 md:gap-x-4"
              aria-label="Client navigation"
            >
              <Link href="/charts" className={clientNavLinkClass}>
                View Charts
              </Link>
              <Link
                href={`/clients/${clientProfileId}/calendar`}
                className={clientNavLinkClass}
              >
                Calendar
              </Link>
              <Link href="/manage-account" className={clientNavLinkClass}>
                Manage Account
              </Link>
              <LogoutButton variant="link" />
            </nav>
          )}
          {isTrainer && (
            <Link href="/manage-account" className={clientNavLinkClass}>
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
              href="/dashboard/exercises"
              className="text-xs text-primary hover:text-primary-hover hover:underline outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded md:text-sm whitespace-normal md:whitespace-nowrap"
            >
              Exercises
            </Link>
            <button
              type="button"
              onClick={() => setTemplatesOpen(true)}
              className="text-xs text-primary hover:text-primary-hover hover:underline outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded md:text-sm whitespace-normal md:whitespace-nowrap"
            >
              Templates
            </button>
            <Link
              href="/dashboard/warmups"
              className="text-xs text-primary hover:text-primary-hover hover:underline outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded md:text-sm whitespace-normal md:whitespace-nowrap"
            >
              Warmups
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
      {isTrainer && (
        <TemplatesManagerModal
          isOpen={templatesOpen}
          onClose={() => setTemplatesOpen(false)}
        />
      )}
    </>
  );
}
