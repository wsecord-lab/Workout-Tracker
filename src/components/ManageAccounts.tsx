"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClientLoginAndLink, removeClientAccount } from "@/app/actions/accounts";
import type { ClientAccountRow } from "@/app/actions/accounts";

type Props = {
  unlinkedClients: { id: string; name: string }[];
  clientAccounts: ClientAccountRow[];
};

export function ManageAccounts({ unlinkedClients, clientAccounts }: Props) {
  const router = useRouter();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [linkMode, setLinkMode] = useState<"existing" | "new">("existing");
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);

  async function handleRemove(userId: string, username: string) {
    if (!confirm(`Remove the client account for ${username}? The client profile will be unlinked and they will no longer be able to sign in with this username.`)) return;
    setRemovingUserId(userId);
    const result = await removeClientAccount(userId);
    setRemovingUserId(null);
    if (result.ok) router.refresh();
    else alert(result.error);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSuccessMessage(null);
    setErrors({});
    setSubmitting(true);

    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.set("linkMode", linkMode);
    if (linkMode === "new") {
      formData.set("newClientName", formData.get("name") ?? "");
      formData.set("newClientAge", formData.get("age") ?? "");
      formData.set("newClientHeightFeet", formData.get("heightFeet") ?? "");
      formData.set("newClientHeightInInches", formData.get("heightInInches") ?? "");
      formData.set("newClientBodyWeightLb", formData.get("bodyWeightLb") ?? "");
    }

    const result = await createClientLoginAndLink(formData);

    if (result.ok) {
      setSuccessMessage("Client login created and linked.");
      form.reset();
      setLinkMode("existing");
      router.refresh();
    } else {
      setErrors(result.errors);
    }
    setSubmitting(false);
  }

  return (
    <div className="space-y-8">
      {successMessage && (
        <div
          className="rounded border border-[var(--success)] bg-[color-mix(in_srgb,var(--success)_12%,transparent)] px-4 py-3 text-sm text-[var(--success)]"
          role="alert"
        >
          {successMessage}
        </div>
      )}

      {/* Section A: Create Client Login */}
      <section className="card max-w-lg">
        <h2 className="mb-4 text-lg font-semibold text-[var(--text)]">
          Create Client Login
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-[var(--text)]">
              Username
            </label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              className="input mt-1"
              disabled={submitting}
              required
            />
            {errors.username && (
              <p className="mt-1 text-sm text-error">{errors.username}</p>
            )}
          </div>

          <div>
            <label htmlFor="tempPassword" className="block text-sm font-medium text-[var(--text)]">
              Temporary Password
            </label>
            <div className="relative mt-1">
              <input
                id="tempPassword"
                name="tempPassword"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                className="input pr-20"
                disabled={submitting}
                required
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowPassword((p) => !p)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted hover:text-[var(--text)] outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            {errors.tempPassword && (
              <p className="mt-1 text-sm text-error">{errors.tempPassword}</p>
            )}
          </div>

          <fieldset>
            <legend className="block text-sm font-medium text-[var(--text)] mb-2">
              Link to existing client or create new client
            </legend>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="linkMode"
                  value="existing"
                  checked={linkMode === "existing"}
                  onChange={() => setLinkMode("existing")}
                  disabled={submitting}
                  className="rounded border-border text-primary focus:ring-primary"
                />
                <span className="text-sm text-[var(--text)]">Link to existing client</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="linkMode"
                  value="new"
                  checked={linkMode === "new"}
                  onChange={() => setLinkMode("new")}
                  disabled={submitting}
                  className="rounded border-border text-primary focus:ring-primary"
                />
                <span className="text-sm text-[var(--text)]">Create new client</span>
              </label>
            </div>
            {errors.linkMode && (
              <p className="mt-1 text-sm text-error">{errors.linkMode}</p>
            )}
          </fieldset>

          {errors._ && (
            <p className="text-sm text-error">{errors._}</p>
          )}

          {linkMode === "existing" && (
            <div>
              <label htmlFor="existingClientId" className="block text-sm font-medium text-[var(--text)]">
                Client
              </label>
              <select
                id="existingClientId"
                name="existingClientId"
                className="input mt-1"
                disabled={submitting || unlinkedClients.length === 0}
              >
                <option value="">Select a client…</option>
                {unlinkedClients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {unlinkedClients.length === 0 && (
                <p className="mt-1 text-sm text-muted">No unlinked clients. Create a new client below or link from the client edit page.</p>
              )}
              {errors.existingClientId && (
                <p className="mt-1 text-sm text-error">{errors.existingClientId}</p>
              )}
            </div>
          )}

          {linkMode === "new" && (
            <div className="space-y-4 rounded border border-border bg-background p-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-[var(--text)]">
                  Name
                </label>
                <input
                  id="name"
                  name="name"
                  className="input mt-1"
                  disabled={submitting}
                  required
                />
                {errors.newClientName && (
                  <p className="mt-1 text-sm text-error">{errors.newClientName}</p>
                )}
              </div>
              <div>
                <label htmlFor="age" className="block text-sm font-medium text-[var(--text)]">
                  Age <span className="text-muted font-normal">(optional)</span>
                </label>
                <input
                  id="age"
                  name="age"
                  type="number"
                  min={0}
                  max={120}
                  className="input mt-1"
                  disabled={submitting}
                />
                {errors.newClientAge && (
                  <p className="mt-1 text-sm text-error">{errors.newClientAge}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text)]">
                  Height <span className="text-muted font-normal">(optional)</span>
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    id="heightFeet"
                    name="heightFeet"
                    type="number"
                    min={0}
                    max={10}
                    placeholder="ft"
                    className="input w-20"
                    disabled={submitting}
                  />
                  <span className="text-muted">ft</span>
                  <input
                    id="heightInInches"
                    name="heightInInches"
                    type="number"
                    min={0}
                    max={11.9}
                    step="0.1"
                    placeholder="in"
                    className="input w-20"
                    disabled={submitting}
                  />
                  <span className="text-muted">in</span>
                </div>
                {(errors.newClientHeightFeet || errors.newClientHeightInInches) && (
                  <p className="mt-1 text-sm text-error">
                    {errors.newClientHeightFeet ?? errors.newClientHeightInInches}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="bodyWeightLb" className="block text-sm font-medium text-[var(--text)]">
                  Body weight (lb) <span className="text-muted font-normal">(optional)</span>
                </label>
                <input
                  id="bodyWeightLb"
                  name="bodyWeightLb"
                  type="number"
                  step="0.1"
                  min={0}
                  className="input mt-1"
                  disabled={submitting}
                />
                {errors.newClientBodyWeightLb && (
                  <p className="mt-1 text-sm text-error">{errors.newClientBodyWeightLb}</p>
                )}
              </div>
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary"
            >
              {submitting ? "Creating…" : "Create Login & Link"}
            </button>
          </div>
        </form>
      </section>

      {/* Section B: Existing Client Accounts */}
      <section className="card">
        <h2 className="mb-4 text-lg font-semibold text-[var(--text)]">
          Existing Client Accounts
        </h2>
        {clientAccounts.length === 0 ? (
          <p className="text-sm text-muted">No client accounts yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[400px]">
              <thead>
                <tr>
                  <th className="table-header text-left">Client name</th>
                  <th className="table-header text-left">Username</th>
                  <th className="table-header text-left">Status</th>
                  <th className="table-header text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {clientAccounts.map((row) => (
                  <tr key={row.userId}>
                    <td className="table-cell text-[var(--text)]">
                      {row.clientName ?? "—"}
                    </td>
                    <td className="table-cell text-[var(--text)]">{row.email}</td>
                    <td className="table-cell">
                      {row.clientId ? (
                        <span className="badge badge-success">Linked</span>
                      ) : (
                        <span className="badge badge-muted">Unlinked</span>
                      )}
                    </td>
                    <td className="table-cell text-right">
                      <div className="flex items-center justify-end gap-2">
                        {row.clientId && (
                          <Link
                            href={`/clients/${row.clientId}`}
                            className="text-sm text-primary hover:text-primary-hover hover:underline outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
                          >
                            Open client →
                          </Link>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemove(row.userId, row.email)}
                          disabled={removingUserId === row.userId}
                          className="rounded bg-error px-3 py-1.5 text-sm font-medium text-white outline-none hover:bg-error-hover focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-70"
                        >
                          {removingUserId === row.userId ? "Removing…" : "Remove"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
