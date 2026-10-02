/**
 * Where to send someone after login. Only the AI-app approval page is allowed,
 * so a crafted link can never bounce people to another site.
 */
export function safeCallbackUrl(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/oauth/authorize")) return null;
  const rest = value.slice("/oauth/authorize".length);
  if (rest !== "" && !rest.startsWith("?")) return null;
  return value;
}
