import { redirect } from "next/navigation";
import { auth } from "@/auth";

/**
 * Auth-aware 404: never show a dead 404 when the user is logged in.
 * - Authenticated trainer → /dashboard
 * - Authenticated client → /auth/redirect (then to /clients/:id or /)
 * - Not authenticated → /login
 * Prevents "back button lands on 404" while still authenticated.
 *
 * Manual QA:
 * 1. Log out. Visit /any-unknown-path → should redirect to /login.
 * 2. Log in as trainer. Visit /random-missing → should redirect to /dashboard.
 * 3. Log in as client. Visit /random-missing → should redirect to /auth/redirect (then to client profile or /).
 * 4. From a valid page, go back to a previously visited 404 URL while still logged in → should land on dashboard/auth-redirect, not 404.
 */
export default async function NotFound() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  const role = (session.user as { role?: string }).role;
  if (role === "TRAINER") {
    redirect("/dashboard");
  }
  redirect("/auth/redirect");
}
