import ExerciseHistory from "@/components/training/ExerciseHistory";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ExerciseHistory id={id} />;
}
