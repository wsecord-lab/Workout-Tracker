import Link from "next/link";
import { requireTrainer } from "@/lib/authz";
import { listTrainerExercises } from "@/app/actions/trainer-exercises";
import { ExerciseManager } from "./ExerciseManager";

export default async function ExercisesPage() {
  const user = await requireTrainer();

  const [active, withArchived] = await Promise.all([
    listTrainerExercises(false),
    listTrainerExercises(true),
  ]);
  const archived = withArchived.filter((e) => e.isArchived);

  return (
    <div>
      <div className="mb-6 flex items-center gap-4">
        <Link
          href="/dashboard"
          className="text-secondary hover:text-secondary-hover hover:underline outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded btn-secondary text-sm py-1.5"
        >
          ← Back
        </Link>
        <h1 className="text-2xl font-bold text-[var(--text)]">Exercise Manager</h1>
      </div>
      <ExerciseManager
        trainerId={user.id}
        initialActive={active}
        initialArchived={archived}
      />
    </div>
  );
}
