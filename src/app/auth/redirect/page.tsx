import { redirect } from "next/navigation";
import { requireUser, getClientIdForCurrentUser } from "@/lib/authz";

/**
 * Post-login redirect: TRAINER → /dashboard, CLIENT → their client profile or /.
 */
export default async function AuthRedirectPage() {
  const user = await requireUser();
  if (user.role === "TRAINER") redirect("/dashboard");
  const clientId = await getClientIdForCurrentUser();
  if (clientId) redirect(`/clients/${clientId}`);
  redirect("/");
}
