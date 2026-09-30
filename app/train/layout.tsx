import type { Metadata } from "next";
import TrainingShell from "@/components/training/TrainingShell";
export const metadata: Metadata = {
  title: "Personal training",
  description: "Private training space.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};
export default function TrainingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TrainingShell>{children}</TrainingShell>;
}
