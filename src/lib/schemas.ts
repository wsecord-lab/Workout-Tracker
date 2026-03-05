import { z } from "zod";

/** Server-side Zod schemas for mutation inputs. Use in addition to existing validators. */

const rpeOptional = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v) => (v === "" || v === undefined ? null : Number(v)))
  .pipe(z.union([z.number().min(1).max(10), z.null()]));

export const setCreateSchema = z.object({
  weightLb: z.union([z.string(), z.number()]).transform((v) => Number(v)).pipe(z.number().min(0)),
  reps: z.union([z.string(), z.number()]).transform((v) => Number(v)).pipe(z.number().int().min(0)),
  rpe: rpeOptional,
  notes: z.string().max(2000).optional().nullable(),
});
export type SetCreateInput = z.infer<typeof setCreateSchema>;

export const setUpdateSchema = setCreateSchema;

export const sessionCreateSchema = z.object({
  clientId: z.string().min(1),
  name: z.string().max(200).optional().nullable(),
});

export const clientIdParamSchema = z.object({ clientId: z.string().cuid() });
export const setIdParamSchema = z.object({ setId: z.string().cuid() });
export const exerciseIdParamSchema = z.object({ exerciseId: z.string().cuid() });
