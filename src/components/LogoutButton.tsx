"use client";

import { signOut } from "next-auth/react";

export function LogoutButton({
  variant = "secondary",
  className = "",
}: {
  variant?: "primary" | "secondary";
  className?: string;
}) {
  const buttonClass = variant === "primary" ? "btn-primary text-sm" : "btn-secondary text-sm";
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className={`${buttonClass} ${className}`.trim()}
    >
      {variant === "primary" ? "Logout" : "Sign out"}
    </button>
  );
}
