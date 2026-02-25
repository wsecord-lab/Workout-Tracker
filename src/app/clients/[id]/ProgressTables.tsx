import type { ProgressByExercise } from "@/lib/progress";
import { formatWeight } from "@/lib/units";

export function ProgressTables({ progress }: { progress: ProgressByExercise[] }) {
  return (
    <div className="space-y-6">
      {progress.map(({ exerciseName, rows }) => (
        <div key={exerciseName} className="overflow-hidden rounded border border-border bg-surface">
          <h4 className="table-header border-b border-border">{exerciseName}</h4>
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="table-header">Session</th>
                <th className="table-header">Best set</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.sessionId} className="border-b border-border last:border-0">
                  <td className="table-cell">
                    {new Date(row.sessionDate).toLocaleDateString("en-US", {
                      dateStyle: "medium",
                    })}
                  </td>
                  <td className="table-cell">
                    {formatWeight(row.bestSet.weightKg)} × {row.bestSet.reps} reps
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
