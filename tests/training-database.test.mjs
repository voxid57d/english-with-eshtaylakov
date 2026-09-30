import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("training migration and normalized workout lifecycle run against PostgreSQL", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key);",
    );
    const schema = readFileSync(
      new URL("../supabase/training_schema.sql", import.meta.url),
      "utf8",
    );
    await db.exec(schema);
    await db.exec(schema);
    const owner = randomUUID(),
      other = randomUUID();
    await db.query("insert into auth.users values($1),($2)", [owner, other]);
    const exercise = randomUUID();
    await db.query(
      "insert into train_exercises(id,owner_user_id,name,category,result_type) values($1,$2,'Bench press','Chest','weight_reps')",
      [exercise, owner],
    );
    await db.query(
      "update train_exercises set name='Bench Press' where id=$1",
      [exercise],
    );
    const start = async (date, repeat = null) =>
      (
        await db.query("select train_start($1,$2,null,$3) id", [
          owner,
          date,
          repeat,
        ])
      ).rows[0].id;
    const id = await start("2026-09-29");
    assert.equal(await start("2026-09-29"), id, "reopen existing day");
    const itemId = randomUUID(),
      setId = randomUUID(),
      set2 = randomUUID();
    const workout = {
      id,
      revision: 0,
      workout_date: "2026-09-29",
      title: "Push",
      notes: "Good session",
      started_at: null,
      ended_at: null,
      exercises: [
        {
          id: itemId,
          exercise_id: exercise,
          notes: "Controlled",
          sets: [
            { id: setId, weight_kg: 75, reps: 8 },
            { id: set2, weight_kg: 70, reps: 10 },
          ],
        },
      ],
    };
    const save = async (w, user = owner) =>
      (
        await db.query("select train_save($1,$2) revision", [
          user,
          JSON.stringify(w),
        ])
      ).rows[0].revision;
    assert.equal(await save(workout), 1);
    const incomplete = structuredClone(workout);
    incomplete.revision = 1;
    incomplete.title = "Must roll back";
    incomplete.exercises[0].sets[0].reps = null;
    await assert.rejects(() => save(incomplete), /Set fields/);
    assert.equal((await db.query("select title from train_workouts where id=$1", [id])).rows[0].title, "Push");
    let stats = (
      await db.query("select * from train_performances where workout_id=$1", [
        id,
      ])
    ).rows[0];
    assert.equal(Number(stats.volume), 1300);
    assert.equal(Number(stats.estimated_1rm), 95);
    assert.equal(Number(stats.sets), 2);
    await assert.rejects(() => save(workout), /changed in another tab/);
    await assert.rejects(
      () => save({ ...workout, revision: 1 }, other),
      /not found/,
    );
    await assert.rejects(
      () =>
        db.query("update train_exercises set result_type='time' where id=$1", [
          exercise,
        ]),
      /Archive this exercise/,
    );
    workout.revision = 1;
    workout.exercises[0].sets[0].weight_kg = 80;
    assert.equal(await save(workout), 2);
    const repeated = await start("2026-09-30", id);
    const repeatedSets = (
      await db.query(
        "select s.* from train_sets s join train_workout_exercises we on we.id=s.workout_exercise_id where we.workout_id=$1",
        [repeated],
      )
    ).rows;
    assert.equal(repeatedSets.length, 2);
    assert.ok(
      repeatedSets.every((s) => s.weight_kg === null && s.reps === null),
    );
    assert.equal(
      (
        await db.query("select * from train_performances where workout_id=$1", [
          repeated,
        ])
      ).rows.length,
      0,
    );
    workout.revision = 2;
    workout.exercises[0].sets.pop();
    assert.equal(await save(workout), 3);
    assert.equal(
      (
        await db.query(
          "select * from train_sets where workout_exercise_id=$1",
          [itemId],
        )
      ).rows.length,
      1,
    );
    workout.revision = 3;
    workout.workout_date = "2026-09-28";
    assert.equal(await save(workout), 4);
    const before = (
      await db.query(
        "select count(*) n from train_records where workout_id=$1",
        [id],
      )
    ).rows[0].n;
    assert.ok(Number(before) > 0);
    await assert.rejects(
      () => db.query("delete from train_exercises where id=$1", [exercise]),
      /foreign key/,
    );
    await db.query("update train_exercises set active=false where id=$1", [
      exercise,
    ]);
    assert.equal(
      (
        await db.query("select active from train_exercises where id=$1", [
          exercise,
        ])
      ).rows[0].active,
      false,
    );
    await db.query(
      "insert into train_measurements(owner_user_id,measured_on,weight_kg,waist_cm) values($1,'2026-09-01',90.2,95),($1,'2026-09-30',89.8,null)",
      [owner],
    );
    assert.deepEqual(
      (
        await db.query(
          "select weight_kg::float from train_measurements where owner_user_id=$1 order by measured_on",
          [owner],
        )
      ).rows.map((r) => r.weight_kg),
      [90.2, 89.8],
    );
    await assert.rejects(
      () =>
        db.query(
          "insert into train_measurements(owner_user_id,measured_on,weight_kg) values($1,'2026-09-30',-2)",
          [owner],
        ),
      /check constraint/,
    );
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      for (const table of [
        "train_profiles",
        "train_exercises",
        "train_workouts",
        "train_workout_exercises",
        "train_sets",
        "train_measurements",
        "train_performances",
        "train_records",
      ])
        await assert.rejects(
          () => db.query(`select * from ${table}`),
          /permission denied/,
        );
      await assert.rejects(
        () =>
          db.query("select train_start($1,'2026-10-01',null,null)", [owner]),
        /permission denied/,
      );
      await db.exec("reset role");
    }
    await db.exec("set role service_role");
    assert.ok((await db.query("select * from train_performances where owner_user_id=$1", [owner])).rows.length > 0);
    assert.ok((await db.query("select * from train_records where owner_user_id=$1", [owner])).rows.length > 0);
    assert.equal(await start("2026-09-30"), repeated);
    await db.exec("reset role");
    await db.query("delete from train_workouts where id=$1", [id]);
    assert.equal(
      (
        await db.query(
          "select * from train_sets where workout_exercise_id=$1",
          [itemId],
        )
      ).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from train_records where workout_id=$1", [id]))
        .rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});
