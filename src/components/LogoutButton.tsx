"use client";

import { signOut } from "next-auth/react";

export function LogoutButton({ variant = "secondary" }: { variant?: "primary" | "secondary" }) {
  const buttonClass = variant === "primary" ? "btn-primary text-sm" : "btn-secondary text-sm";
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className={buttonClass}
    >
      {variant === "primary" ? "Logout" : "Sign out"}
    </button>
  );
}
