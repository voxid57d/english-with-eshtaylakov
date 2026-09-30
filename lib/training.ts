export const RESULT_TYPES = {
  weight_reps: "Weight + Reps",
  bodyweight_reps: "Bodyweight + Reps",
  reps: "Reps Only",
  time: "Time",
  distance_time: "Distance + Time",
} as const;
export type ResultType = keyof typeof RESULT_TYPES;
export const CATEGORIES = [
  "Chest",
  "Back",
  "Shoulders",
  "Biceps",
  "Triceps",
  "Legs",
  "Core",
  "Cardio",
  "Other",
];
export const MEASUREMENTS = {
  weight_kg: "Weight (kg)",
  waist_cm: "Waist (cm)",
  chest_cm: "Chest (cm)",
  shoulder_cm: "Shoulders (cm)",
  neck_cm: "Neck (cm)",
  upper_arm_cm: "Upper arm (cm)",
  forearm_cm: "Forearm (cm)",
  hip_cm: "Hip (cm)",
  thigh_cm: "Thigh (cm)",
  calf_cm: "Calf (cm)",
} as const;
export type MeasurementKey = keyof typeof MEASUREMENTS;
export type Exercise = {
  id: string;
  name: string;
  category: string;
  result_type: ResultType;
  muscle: string;
  notes: string;
  active: boolean;
};
export type TrainingSet = {
  id: string;
  weight_kg: number | null;
  reps: number | null;
  duration_seconds: number | null;
  distance_km: number | null;
};
export type SessionExercise = {
  id: string;
  exercise_id: string;
  notes: string;
  sets: TrainingSet[];
  exercise: Exercise;
};
export type Workout = {
  id: string;
  workout_date: string;
  title: string;
  notes: string;
  started_at: string | null;
  ended_at: string | null;
  revision: number;
  exercises: SessionExercise[];
};
export type Measurement = {
  id: string;
  measured_on: string;
  notes: string;
} & Record<MeasurementKey, number | null>;
export type Profile = { birth_year: number | null; height_cm: number | null };
export type Performance = {
  workout_id: string;
  exercise_id: string;
  workout_date: string;
  name: string;
  result_type: ResultType;
  max_weight: number | null;
  reps: number;
  volume: number;
  estimated_1rm: number | null;
  duration: number | null;
  distance: number | null;
  sets: number;
};
export type PersonalRecord = {
  workout_id: string;
  exercise_id: string;
  workout_date: string;
  name: string;
  metric: string;
  value: number;
  previous: number | null;
};
export type WorkoutSummary = Pick<
  Workout,
  "id" | "workout_date" | "title" | "started_at" | "ended_at"
>;
export function emptySet(): TrainingSet {
  return {
    id: crypto.randomUUID(),
    weight_kg: null,
    reps: null,
    duration_seconds: null,
    distance_km: null,
  };
}
export function fieldsFor(type: ResultType): (keyof Omit<TrainingSet, "id">)[] {
  return type === "weight_reps" || type === "bodyweight_reps"
    ? ["weight_kg", "reps"]
    : type === "reps"
      ? ["reps"]
      : type === "time"
        ? ["duration_seconds"]
        : ["distance_km", "duration_seconds"];
}
// Epley is deliberately restricted to loaded lifts and 1–12 reps; higher-rep estimates are unreliable.
export function estimatedOneRepMax(
  weight: number | null,
  reps: number | null,
  type: ResultType,
) {
  if (
    type !== "weight_reps" ||
    weight === null ||
    weight <= 0 ||
    reps === null ||
    reps < 1 ||
    !Number.isInteger(reps) ||
    reps > 12
  )
    return null;
  return reps === 1 ? weight : Math.round(weight * (1 + reps / 30) * 100) / 100;
}
export function setComplete(set: TrainingSet, type: ResultType) {
  return fieldsFor(type).every(
    (key) =>
      (type === "bodyweight_reps" && key === "weight_kg") || set[key] !== null,
  );
}
export function workoutStats(workout: Workout) {
  let sets = 0,
    reps = 0,
    volume = 0;
  for (const item of workout.exercises)
    for (const set of item.sets) {
      if (!setComplete(set, item.exercise.result_type)) continue;
      sets++;
      reps += set.reps ?? 0;
      if (
        ["weight_reps", "bodyweight_reps"].includes(item.exercise.result_type)
      )
        volume += (set.weight_kg ?? 0) * (set.reps ?? 0);
    }
  const duration =
    workout.started_at && workout.ended_at
      ? Math.max(
          0,
          Math.round(
            (Date.parse(workout.ended_at) - Date.parse(workout.started_at)) /
              60000,
          ),
        )
      : null;
  return { exercises: workout.exercises.length, sets, reps, volume, duration };
}
export function formatSet(set: TrainingSet, type: ResultType) {
  if (!setComplete(set, type)) return "Not recorded";
  if (type === "weight_reps" || type === "bodyweight_reps")
    return `${set.weight_kg ?? 0} kg × ${set.reps} reps`;
  if (type === "reps") return `${set.reps} reps`;
  return `${type === "distance_time" ? `${set.distance_km} km · ` : ""}${set.duration_seconds} sec`;
}
export class TrainingError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function validDate(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value ||
    value < "1900-01-01" ||
    value > "2100-12-31"
  )
    throw new TrainingError("Enter a valid date (1900–2100).");
  return value;
}
export function validId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new TrainingError("Invalid record ID.");
  return value;
}
export function textField(value: unknown, max = 2000): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string" || value.length > max)
    throw new TrainingError(`Text must be at most ${max} characters.`);
  return value.trim();
}
export function numeric(
  value: unknown,
  label: string,
  max: number,
  min = 0,
  integer = false,
): number | null {
  if (value === "" || value === null || value === undefined) return null;
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    (typeof value === "string" && !value.trim())
  )
    throw new TrainingError(`Invalid ${label}.`);
  const n = Number(value);
  if (
    !Number.isFinite(n) ||
    n < min ||
    n > max ||
    (integer && !Number.isInteger(n))
  )
    throw new TrainingError(
      `${label} must be ${integer ? "a whole number " : ""}between ${min} and ${max}.`,
    );
  return n;
}
export function validateExercise(input: Record<string, unknown>) {
  const name = textField(input.name, 100),
    category = textField(input.category, 60);
  if (
    !name ||
    !category ||
    !Object.hasOwn(RESULT_TYPES, String(input.result_type))
  )
    throw new TrainingError(
      "Name, category and a valid result type are required.",
    );
  if (typeof input.active !== "boolean")
    throw new TrainingError("Active must be true or false.");
  return {
    name,
    category,
    result_type: input.result_type as ResultType,
    muscle: textField(input.muscle, 100),
    notes: textField(input.notes),
    active: input.active,
  };
}
export function validateSet(input: TrainingSet, type: ResultType): TrainingSet {
  const allowed = fieldsFor(type);
  const result: TrainingSet = {
    id: validId(input.id),
    weight_kg: null,
    reps: null,
    duration_seconds: null,
    distance_km: null,
  };
  for (const key of allowed)
    result[key] = numeric(
      input[key],
      key,
      key === "weight_kg"
        ? 1500
        : key === "reps"
          ? 10000
          : key === "distance_km"
            ? 1000
            : 604800,
      key === "weight_kg" ? 0 : key === "distance_km" ? 0.001 : 1,
      key === "reps" || key === "duration_seconds",
    );
  const hasValue = allowed.some((key) => result[key] !== null);
  if (hasValue && !setComplete(result, type))
    throw new TrainingError(
      "Complete all required fields in a set, or leave the whole set empty.",
    );
  return result;
}
export function validateMeasurement(input: Record<string, unknown>) {
  const values = Object.fromEntries(
    Object.keys(MEASUREMENTS).map((key) => [
      key,
      numeric(
        input[key],
        MEASUREMENTS[key as MeasurementKey],
        key === "weight_kg" ? 500 : 400,
        1,
      ),
    ]),
  ) as Record<MeasurementKey, number | null>;
  if (Object.values(values).every((value) => value === null))
    throw new TrainingError("Enter at least one measurement.");
  return {
    id: validId(input.id),
    measured_on: validDate(input.measured_on),
    notes: textField(input.notes),
    ...values,
  };
}
