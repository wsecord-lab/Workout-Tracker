import { revalidatePath } from "next/cache";

/** Invalidate client detail and calendar after workout or rest-day changes. */
export function revalidateClientWorkoutViews(clientId: string): void {
  revalidatePath(`/clients/${clientId}`);
  revalidatePath(`/clients/${clientId}/calendar`);
}
