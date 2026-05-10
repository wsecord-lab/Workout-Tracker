"use client";

import { signOut } from "next-auth/react";

const linkNavClass =
  "text-xs text-primary hover:text-primary-hover hover:underline outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded md:text-sm whitespace-normal md:whitespace-nowrap bg-transparent border-0 p-0 cursor-pointer font-inherit";

export function LogoutButton({
  variant = "secondary",
  className = "",
}: {
  variant?: "primary" | "secondary" | "link";
  className?: string;
}) {
  const buttonClass =
    variant === "primary"
      ? "btn-primary text-sm"
      : variant === "link"
        ? linkNavClass
        : "btn-secondary text-sm";
  const label =
    variant === "secondary" ? "Sign out" : "Logout";
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className={`${buttonClass} ${className}`.trim()}
    >
      {label}
    </button>
  );
}
