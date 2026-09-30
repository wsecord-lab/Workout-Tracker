"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  listTemplates,
  createTemplate,
  updateTemplate,
  archiveTemplate,
  restoreTemplate,
  type TemplateWithItems,
} from "@/app/actions/templates";

export type TemplateItemFormInput = {
  exerciseName: string;
  orderIndex: number;
  plannedSetCount?: number | null;
  plannedWeightLb?: number | string | null;
  plannedReps?: number | string | null;
};

export function useTemplates(includeArchived = false) {
  const router = useRouter();
  const [templates, setTemplates] = useState<TemplateWithItems[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const result = await listTemplates(includeArchived);
    if (result.ok) {
      setTemplates(result.templates);
    } else {
      setTemplates([]);
    }
    setIsLoading(false);
    router.refresh();
  }, [includeArchived, router]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = useCallback(
    async (data: { name: string; items: TemplateItemFormInput[] }) => {
      const result = await createTemplate({
        name: data.name,
        items: data.items,
      });
      if (result.ok) {
        setTemplates((prev) => [result.template, ...prev]);
        router.refresh();
        return { ok: true as const, template: result.template };
      }
      return { ok: false as const, errors: result.errors };
    },
    [router]
  );

  const update = useCallback(
    async (id: string, data: { name?: string; items?: TemplateItemFormInput[] }) => {
      const result = await updateTemplate(id, data);
      if (result.ok) {
        setTemplates((prev) =>
          prev.map((t) => (t.id === id ? result.template : t))
        );
        router.refresh();
        return { ok: true as const, template: result.template };
      }
      return { ok: false as const, errors: result.errors };
    },
    [router]
  );

  const archive = useCallback(
    async (id: string) => {
      const result = await archiveTemplate(id);
      if (result.ok) {
        setTemplates((prev) => prev.filter((t) => t.id !== id));
        router.refresh();
        return { ok: true as const };
      }
      return { ok: false as const, error: result.error };
    },
    [router]
  );

  const restore = useCallback(
    async (id: string) => {
      const result = await restoreTemplate(id);
      if (result.ok) {
        await refresh();
        return { ok: true as const };
      }
      return { ok: false as const, error: result.error };
    },
    [router, refresh]
  );

  return {
    templates,
    isLoading,
    createTemplate: create,
    updateTemplate: update,
    archiveTemplate: archive,
    restoreTemplate: restore,
    refresh,
  };
}
