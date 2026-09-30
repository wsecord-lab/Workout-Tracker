/**
 * Copy helpers for finishing an in-progress workout with unchecked sets.
 * Pure so ActiveWorkoutMode and tests share the same wording.
 */

export type FinishSkippedCopy = {
  title: string;
  body: string;
  cancelLabel: string;
  confirmLabel: string;
};

/**
 * Build the finish confirmation when some sets are still unchecked.
 * `skipped` must be > 0. Distinguishes pause (leave to edit) from finish (end workout).
 */
export function getFinishSkippedCopy(
  skipped: number,
  completed: number,
  total: number
): FinishSkippedCopy {
  const setWord = skipped === 1 ? "set" : "sets";
  return {
    title: `Finish with ${skipped} skipped ${setWord}?`,
    body:
      `You've completed ${completed} of ${total} sets. ` +
      `The remaining ${skipped} ${setWord} will stay on this workout as skipped ` +
      `(you'll still see what was planned vs done).\n\n` +
      `This ends the workout — it does not pause. Use Pause if you still need to edit.`,
    cancelLabel: "Keep working",
    confirmLabel: skipped === 1 ? "Finish with 1 skipped" : `Finish with ${skipped} skipped`,
  };
}
