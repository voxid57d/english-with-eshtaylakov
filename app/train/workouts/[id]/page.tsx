import WorkoutEditor from "@/components/training/WorkoutEditor";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <WorkoutEditor id={id} />;
}
