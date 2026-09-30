import { redirect } from "next/navigation";
import { requireUser, getClientIdForCurrentUser } from "@/lib/authz";

/**
 * Post-login redirect: forced password change first, then
 * TRAINER → /dashboard, CLIENT → their client profile or /.
 */
export default async function AuthRedirectPage() {
  const user = await requireUser({ allowPasswordChange: true });
  if (user.mustChangePassword) {
    redirect("/manage-account/change-password?required=1");
  }
  if (user.role === "TRAINER") redirect("/dashboard");
  const clientId = await getClientIdForCurrentUser();
  if (clientId) redirect(`/clients/${clientId}`);
  redirect("/");
}
