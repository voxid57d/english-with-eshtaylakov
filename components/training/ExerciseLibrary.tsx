"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CATEGORIES,
  RESULT_TYPES,
  type Exercise,
  type ResultType,
} from "@/lib/training";
import {
  trainingRequest,
  useTrainingAction,
  useTrainingDirty,
  useTrainingQuery,
} from "./trainingClient";
import styles from "./training.module.css";
export function ExercisePicker({
  onChoose,
  recent = [],
}: {
  onChoose: (exercise: Exercise) => void;
  recent?: Exercise[];
}) {
  const [search, setSearch] = useState(""),
    [page, setPage] = useState(0);
  const { data, error, loading } = useTrainingQuery<{
    exercises: Exercise[];
    more: boolean;
  }>(`view=exercises&search=${encodeURIComponent(search)}&page=${page}`);
  const recentQuery = useTrainingQuery<{ exercises: Exercise[] }>(
    "view=recent",
  );
  const choices =
    !search && page === 0
      ? Array.from(
          new Map(
            [
              ...(recentQuery.data?.exercises ?? []),
              ...recent,
              ...(data?.exercises ?? []),
            ].map((e) => [e.id, e]),
          ).values(),
        )
      : (data?.exercises ?? []);
  return (
    <>
      <label>
        Find an exercise
        <input
          type="search"
          value={search}
          placeholder="Search your library…"
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
      </label>
      {loading && <p>Loading exercises…</p>}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <div className={styles.picker}>
        {choices
          .filter((e) => e.active)
          .map((e) => (
            <button key={e.id} onClick={() => onChoose(e)}>
              <b>{e.name}</b>
              <small>
                {e.category} · {RESULT_TYPES[e.result_type]}
              </small>
            </button>
          ))}
      </div>
      {data && !choices.some((e) => e.active) && (
        <p className={styles.empty}>
          No active exercises found.{" "}
          <Link href="/train/exercises?new=1">Create an exercise</Link>.
        </p>
      )}
      <div className={styles.actions}>
        {page > 0 && (
          <button onClick={() => setPage((p) => p - 1)}>Previous</button>
        )}
        {data?.more && (
          <button onClick={() => setPage((p) => p + 1)}>More exercises</button>
        )}
      </div>
    </>
  );
}
export default function ExerciseLibrary() {
  const [search, setSearch] = useState(""),
    [page, setPage] = useState(0),
    [editing, setEditing] = useState<Exercise | null>(null),
    [dirty, setDirty] = useState(false);
  const { data, error, loading, reload } = useTrainingQuery<{
      exercises: Exercise[];
      more: boolean;
    }>(`view=exercises&search=${encodeURIComponent(search)}&page=${page}`),
    action = useTrainingAction();
  useTrainingDirty(dirty);
  function create() {
    setEditing({
      id: crypto.randomUUID(),
      name: "",
      category: "Other",
      result_type: "weight_reps",
      muscle: "",
      notes: "",
      active: true,
    });
    setDirty(false);
  }
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("new")) {
      const timer = setTimeout(create, 0);
      return () => clearTimeout(timer);
    }
  }, []);
  function edit(values: Partial<Exercise>) {
    setEditing((e) => (e ? { ...e, ...values } : e));
    setDirty(true);
  }
  return (
    <>
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>YOUR MOVEMENT TOOLKIT</p>
          <h1>Exercise library</h1>
          <p className={styles.muted}>
            Build a library that fits the way you train.
          </p>
        </div>
        <button
          className={styles.primary}
          disabled={!!editing}
          onClick={create}
        >
          + Add Exercise
        </button>
      </div>
      {(error || action.error) && (
        <p role="alert" className={styles.error}>
          {error || action.error}
        </p>
      )}
      {editing && (
        <form
          className={styles.card}
          onSubmit={(e) => {
            e.preventDefault();
            void action.run(async () => {
              await trainingRequest("", { action: "exercise", ...editing });
              setDirty(false);
              setEditing(null);
              reload();
            });
          }}
        >
          <h2>
            {data?.exercises.some((e) => e.id === editing.id)
              ? "Edit exercise"
              : "New exercise"}
          </h2>
          <fieldset disabled={action.busy} className={styles.formGrid}>
            <label>
              Name
              <input
                required
                maxLength={100}
                value={editing.name}
                onChange={(e) => edit({ name: e.target.value })}
                placeholder="e.g. Bench press"
              />
            </label>
            <label>
              Category
              <input
                required
                list="training-categories"
                maxLength={60}
                value={editing.category}
                onChange={(e) => edit({ category: e.target.value })}
              />
              <datalist id="training-categories">
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </datalist>
            </label>
            <label>
              Result type
              <select
                value={editing.result_type}
                onChange={(e) =>
                  edit({ result_type: e.target.value as ResultType })
                }
              >
                {Object.entries(RESULT_TYPES).map(([key, label]) => (
                  <option value={key} key={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Target muscle (optional)
              <input
                maxLength={100}
                value={editing.muscle}
                onChange={(e) => edit({ muscle: e.target.value })}
              />
            </label>
            <label>
              Notes (optional)
              <textarea
                maxLength={2000}
                value={editing.notes}
                onChange={(e) => edit({ notes: e.target.value })}
              />
            </label>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={editing.active}
                onChange={(e) => edit({ active: e.target.checked })}
              />{" "}
              Active in exercise picker
            </label>
            <div className={styles.actions}>
              <button className={styles.primary}>
                {action.busy ? "Saving…" : "Save exercise"}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!dirty || confirm("Discard exercise changes?")) {
                    setEditing(null);
                    setDirty(false);
                  }
                }}
              >
                Cancel
              </button>
            </div>
          </fieldset>
          <p className={styles.muted}>
            Once an exercise has history, its result type is fixed. Archive it
            and create a new exercise to use another type.
          </p>
        </form>
      )}
      <section className={styles.card}>
        <label>
          Search exercises
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="Search by name"
          />
        </label>
        {loading && <p>Loading library…</p>}
        {data?.exercises.map((ex) => (
          <div key={ex.id} className={styles.listRow}>
            <Link href={`/train/exercises/${ex.id}`}>
              <b>
                {ex.name}{" "}
                {!ex.active && <span className={styles.badge}>Archived</span>}
              </b>
              <small>
                {ex.category} · {RESULT_TYPES[ex.result_type]}
              </small>
            </Link>
            <div className={styles.actions}>
              <button
                disabled={!!editing || action.busy}
                onClick={() => {
                  setEditing(ex);
                  setDirty(false);
                }}
              >
                Edit
              </button>
              <button
                disabled={action.busy || !!editing}
                onClick={() => {
                  if (
                    confirm(
                      `Delete ${ex.name}? If it has workout history it will be archived instead.`,
                    )
                  )
                    void action.run(async () => {
                      await trainingRequest(
                        "",
                        { action: "exercise", id: ex.id },
                        "DELETE",
                      );
                      reload();
                    });
                }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {data && !data.exercises.length && (
          <p className={styles.empty}>
            No exercises yet. Add your first movement to get started.
          </p>
        )}
        <div className={styles.actions}>
          {page > 0 && (
            <button onClick={() => setPage((p) => p - 1)}>Previous</button>
          )}
          {data?.more && (
            <button onClick={() => setPage((p) => p + 1)}>Next</button>
          )}
        </div>
      </section>
    </>
  );
}
