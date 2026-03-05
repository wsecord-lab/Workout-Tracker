"use client";

import React, { createContext, useCallback, useContext, useState } from "react";
import { Toaster } from "./Toaster";

export type ToastType = "success" | "error";
export type Toast = {
  id: string;
  type: ToastType;
  message: string;
  undo?: { label: string; onUndo: () => void };
};

export type AddToastOptions = {
  undoLabel?: string;
  onUndo?: () => void;
};

type ToastContextValue = {
  toasts: Toast[];
  addToast: (type: ToastType, message: string, options?: AddToastOptions) => string;
  removeToast: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback(
    (type: ToastType, message: string, options?: AddToastOptions): string => {
      const id = Math.random().toString(36).slice(2);
      const toast: Toast = {
        id,
        type,
        message,
        ...(options?.onUndo != null && options.undoLabel != null
          ? { undo: { label: options.undoLabel, onUndo: options.onUndo } }
          : undefined),
      };
      setToasts((prev) => [...prev, toast]);
      if (!toast.undo) {
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 5000);
      }
      return id;
    },
    []
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <Toaster toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
