"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  PiBarbell,
  PiChartLine,
  PiHouse,
  PiListBullets,
  PiRuler,
  PiLockKey,
} from "react-icons/pi";
import { supabase } from "@/lib/supabaseClient";
import { confirmPageLeave } from "@/lib/unsavedChanges";
import { trainingRequest } from "./trainingClient";
import styles from "./training.module.css";
const links = [
  { href: "/train", label: "Today", Icon: PiHouse },
  { href: "/train/exercises", label: "Exercises", Icon: PiBarbell },
  { href: "/train/history", label: "History", Icon: PiListBullets },
  { href: "/train/measurements", label: "Body", Icon: PiRuler },
  { href: "/train/progress", label: "Progress", Icon: PiChartLine },
];
export default function TrainingShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const path = usePathname(),
    [access, setAccess] = useState("loading"),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    async function check() {
      try {
        const { data } = await supabase.auth.getSession();
        if (!active) return;
        if (!data.session) {
          setAccess("signed-out");
          return;
        }
        await trainingRequest("view=access");
        if (active) {
          setAccess("ready");
          setError("");
        }
      } catch (cause) {
        if (active) {
          setAccess("denied");
          setError(
            cause instanceof Error ? cause.message : "Access unavailable.",
          );
        }
      }
    }
    void check();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setAccess("signed-out");
        setError("");
      } else if (event === "SIGNED_IN") setTimeout(() => void check(), 0);
    });
    const lost = () => {
      setAccess("denied");
      setError("Your access has expired or changed. Sign in again.");
    };
    window.addEventListener("training:access-lost", lost);
    return () => {
      active = false;
      subscription.unsubscribe();
      window.removeEventListener("training:access-lost", lost);
    };
  }, []);
  async function signIn() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(path)}`,
      },
    });
    if (error) setError(error.message);
  }
  async function signOut() {
    if (confirmPageLeave()) {
      await supabase.auth.signOut();
      setAccess("signed-out");
    }
  }
  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <Link href="/train" className={styles.brand}>
          <span className={styles.brandIcon}>
            <PiBarbell />
          </span>
          <span>
            Personal training
            <small>
              <PiLockKey /> Your private space
            </small>
          </span>
        </Link>
        {access === "ready" && (
          <button onClick={() => void signOut()}>Sign out</button>
        )}
      </header>
      {access !== "ready" ? (
        <main className={styles.gate}>
          <PiLockKey size={32} />
          <p className={styles.eyebrow}>PERSONAL / TRAINING</p>
          <h1>A little stronger, every day.</h1>
          <p className={styles.muted}>
            {access === "loading"
              ? "Checking your access…"
              : "Your workouts, measurements and progress. Just for you."}
          </p>
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          {access !== "loading" && (
            <div className={styles.actions}>
              <button className={styles.primary} onClick={() => void signIn()}>
                Sign in with Google
              </button>
              {access === "denied" && (
                <button onClick={() => void signOut()}>Sign out</button>
              )}
            </div>
          )}
        </main>
      ) : (
        <>
          <nav className={styles.nav} aria-label="Training">
            {links.map(({ href, label, Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={
                  (href === "/train" ? path === href : path.startsWith(href))
                    ? "page"
                    : undefined
                }
              >
                <Icon />
                <span>{label}</span>
              </Link>
            ))}
          </nav>
          <main className={styles.main}>{children}</main>
        </>
      )}
    </div>
  );
}
