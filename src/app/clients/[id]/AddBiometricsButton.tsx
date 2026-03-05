"use client";

import { useState } from "react";
import { addBiometricRecord } from "@/app/actions/biometrics";

export function AddBiometricsButton({
  clientId,
  className = "",
}: {
  clientId: string;
  className?: string;
}) {
  const [showForm, setShowForm] = useState(false);
  const [weightLb, setWeightLb] = useState("");
  const [date, setDate] = useState(() => {
    const today = new Date();
    return today.toISOString().slice(0, 10);
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const w = parseFloat(weightLb);
    if (Number.isNaN(w) || w <= 0) {
      setError("Enter a valid weight (lb).");
      return;
    }
    setSubmitting(true);
    const result = await addBiometricRecord(clientId, w, date);
    setSubmitting(false);
    if (result.ok) {
      setWeightLb("");
      setDate(new Date().toISOString().slice(0, 10));
      setShowForm(false);
      return;
    }
    setError(result.errors.weightLb ?? result.errors.date ?? "Failed to save.");
  }

  if (!showForm) {
    return (
      <button
        type="button"
        onClick={() => setShowForm(true)}
        className={`btn-primary text-sm ${className}`.trim()}
      >
        Add biometrics
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-3 rounded border border-border bg-surface p-4"
    >
      <div>
        <label htmlFor="biometric-weight" className="block text-sm font-medium text-[var(--text)]">
          Body weight (lb)
        </label>
        <input
          id="biometric-weight"
          type="number"
          step="0.1"
          min="1"
          max="2000"
          value={weightLb}
          onChange={(e) => setWeightLb(e.target.value)}
          className="input mt-1 w-24"
          placeholder="lb"
          required
        />
      </div>
      <div>
        <label htmlFor="biometric-date" className="block text-sm font-medium text-[var(--text)]">
          Date
        </label>
        <input
          id="biometric-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="input mt-1"
        />
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={submitting} className="btn-primary text-sm">
          {submitting ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            setShowForm(false);
            setError("");
          }}
          className="btn-secondary text-sm"
        >
          Cancel
        </button>
      </div>
      {error && <p className="w-full text-sm text-error">{error}</p>}
    </form>
  );
}
