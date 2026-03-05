"use client";

import { useState } from "react";

type PasswordInputProps = {
  id: string;
  name: string;
  required?: boolean;
  autoComplete?: string;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
};

export function PasswordInput({
  id,
  name,
  required,
  autoComplete,
  placeholder,
  className = "input",
  "aria-label": ariaLabel,
}: PasswordInputProps) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type={show ? "text" : "password"}
        required={required}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={`${className} pr-14`}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-sm font-medium text-primary hover:text-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        tabIndex={-1}
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? "Hide" : "Show"}
      </button>
    </div>
  );
}
