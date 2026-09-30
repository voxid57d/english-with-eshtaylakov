"use client";
import { useState } from "react";
import {
  MEASUREMENTS,
  type Measurement,
  type MeasurementKey,
  type Profile,
} from "@/lib/training";
import { useLocalToday } from "@/lib/useLocalToday";
import {
  trainingRequest,
  useTrainingAction,
  useTrainingDirty,
  useTrainingQuery,
} from "./trainingClient";
import styles from "./training.module.css";
type Payload = { profile: Profile; measurements: Measurement[]; more: boolean };
export default function Measurements() {
  const [page, setPage] = useState(0),
    query = useTrainingQuery<Payload>(`view=measurements&page=${page}`);
  return (
    <>
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>MORE THAN A NUMBER</p>
          <h1>Body measurements</h1>
          <p className={styles.muted}>
            A quick weigh-in, or the full picture. Record what matters today.
          </p>
        </div>
      </div>
      {query.error && (
        <p role="alert" className={styles.error}>
          {query.error}
          <button onClick={query.reload}>Retry</button>
        </p>
      )}
      {query.loading ? (
        <p>Loading measurements…</p>
      ) : (
        query.data && (
          <MeasurementEditor
            data={query.data}
            reload={query.reload}
            page={page}
            setPage={setPage}
          />
        )
      )}
    </>
  );
}
function MeasurementEditor({
  data,
  reload,
  page,
  setPage,
}: {
  data: Payload;
  reload: () => void;
  page: number;
  setPage: (page: number) => void;
}) {
  const today = useLocalToday();
  function blank(): Measurement {
    return {
      id: crypto.randomUUID(),
      measured_on: today,
      notes: "",
      ...Object.fromEntries(
        Object.keys(MEASUREMENTS).map((key) => [key, null]),
      ),
    } as Measurement;
  }
  const [entry, setEntry] = useState<Measurement>(blank),
    [profile, setProfile] = useState(data.profile),
    [dirty, setDirty] = useState(false),
    [profileDirty, setProfileDirty] = useState(false),
    action = useTrainingAction(),
    [message, setMessage] = useState("");
  useTrainingDirty(dirty || profileDirty);
  function change(values: Partial<Measurement>) {
    setEntry((e) => ({ ...e, ...values }));
    setDirty(true);
    setMessage("");
  }
  function number(key: MeasurementKey) {
    return (
      <label key={key}>
        {MEASUREMENTS[key]}
        <input
          type="number"
          inputMode="decimal"
          min={1}
          max={key === "weight_kg" ? 500 : 400}
          step="any"
          value={entry[key] ?? ""}
          onChange={(e) =>
            change({
              [key]: e.target.value === "" ? null : Number(e.target.value),
            })
          }
          placeholder="Optional"
        />
      </label>
    );
  }
  return (
    <>
      <form
        className={styles.card}
        onSubmit={(e) => {
          e.preventDefault();
          void action.run(async () => {
            await trainingRequest("", { action: "measurement", ...entry });
            setDirty(false);
            setMessage("Measurement saved.");
            reload();
          });
        }}
      >
        <fieldset disabled={action.busy}>
          <h2>
            {data.measurements.some((m) => m.id === entry.id)
              ? "Edit measurement"
              : "Record a measurement"}
          </h2>
          <div className={styles.formGrid}>
            <label>
              Date
              <input
                required
                type="date"
                value={entry.measured_on}
                max={today}
                onChange={(e) => change({ measured_on: e.target.value })}
              />
            </label>
            {number("weight_kg")}
          </div>
          <details className={styles.notes}>
            <summary>Circumferences & notes (optional)</summary>
            <div className={styles.formGrid}>
              {(Object.keys(MEASUREMENTS) as MeasurementKey[])
                .filter((key) => key !== "weight_kg")
                .map(number)}
              <label>
                Measurement notes
                <textarea
                  maxLength={2000}
                  value={entry.notes}
                  onChange={(e) => change({ notes: e.target.value })}
                />
              </label>
            </div>
          </details>
          <div className={styles.actions} style={{ marginTop: 20 }}>
            <button
              disabled={!dirty || profileDirty}
              className={styles.primary}
            >
              Save measurement
            </button>
            <button
              type="button"
              onClick={() => {
                if (!dirty || confirm("Discard measurement changes?")) {
                  setEntry(blank());
                  setDirty(false);
                }
              }}
            >
              New / clear
            </button>
          </div>
          {profileDirty && (
            <p className={styles.muted}>
              Save your profile changes below before saving a measurement.
            </p>
          )}
        </fieldset>
      </form>
      <details className={styles.card}>
        <summary>Profile · height & birth year</summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void action.run(async () => {
              await trainingRequest("", { action: "profile", ...profile });
              setProfileDirty(false);
              setMessage("Profile saved.");
            });
          }}
        >
          <fieldset
            disabled={action.busy}
            className={styles.formGrid}
            style={{ marginTop: 18 }}
          >
            <label>
              Height (cm)
              <input
                type="number"
                inputMode="decimal"
                min={50}
                max={300}
                step="any"
                value={profile.height_cm ?? ""}
                onChange={(e) => {
                  setProfile({
                    ...profile,
                    height_cm: e.target.value ? Number(e.target.value) : null,
                  });
                  setProfileDirty(true);
                }}
              />
            </label>
            <label>
              Birth year
              <input
                type="number"
                inputMode="numeric"
                min={1900}
                max={Number(today.slice(0, 4))}
                value={profile.birth_year ?? ""}
                onChange={(e) => {
                  setProfile({
                    ...profile,
                    birth_year: e.target.value ? Number(e.target.value) : null,
                  });
                  setProfileDirty(true);
                }}
              />
            </label>
            <button disabled={!profileDirty} className={styles.primary}>
              Save profile
            </button>
          </fieldset>
        </form>
      </details>
      {action.error && (
        <p role="alert" className={styles.error}>
          {action.error}
        </p>
      )}
      {message && (
        <p role="status" className={styles.success}>
          {message}
        </p>
      )}
      <section className={styles.card}>
        <h2>Measurement history</h2>
        {!data.measurements.length && (
          <p className={styles.empty}>
            No measurements yet. Start with your weight above.
          </p>
        )}
        {data.measurements.map((m) => (
          <div key={m.id} className={styles.listRow}>
            <div>
              <b>
                {m.measured_on}
                {m.weight_kg ? ` · ${m.weight_kg} kg` : ""}
              </b>
              <small>
                {(Object.keys(MEASUREMENTS) as MeasurementKey[])
                  .filter((key) => key !== "weight_kg" && m[key] !== null)
                  .map((key) => `${MEASUREMENTS[key]}: ${m[key]}`)
                  .join(" · ")}
              </small>
              {m.notes && <small>{m.notes}</small>}
            </div>
            <div className={styles.actions}>
              <button
                disabled={action.busy}
                onClick={() => {
                  if (!dirty || confirm("Discard measurement changes?")) {
                    setEntry(m);
                    setDirty(false);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }
                }}
              >
                Edit
              </button>
              <button
                disabled={action.busy || dirty || profileDirty}
                onClick={() => {
                  if (confirm("Delete this measurement permanently?"))
                    void action.run(async () => {
                      await trainingRequest(
                        "",
                        { action: "measurement", id: m.id },
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
        <div className={styles.actions} style={{ marginTop: 14 }}>
          {page > 0 && (
            <button
              disabled={dirty || profileDirty}
              onClick={() => setPage(page - 1)}
            >
              Newer
            </button>
          )}
          {data.more && (
            <button
              disabled={dirty || profileDirty}
              onClick={() => setPage(page + 1)}
            >
              Older
            </button>
          )}
        </div>
      </section>
    </>
  );
}
