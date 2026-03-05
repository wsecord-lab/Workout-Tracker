import { redirect } from "next/navigation";

export default function SettingsPasswordPage() {
  redirect("/manage-account/change-password");
}
