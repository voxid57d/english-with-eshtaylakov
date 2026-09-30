import { requireAuthenticatedUser } from "@/lib/serverAuth";
import { TrainingError } from "@/lib/training";

export async function requireTrainingUser(req: Request) {
  let user;
  try {
    user = await requireAuthenticatedUser(req);
  } catch {
    throw new TrainingError("Please sign in to continue.", 401);
  }
  const owner = process.env.TRAIN_USER_ID?.trim();
  if (!owner)
    throw new TrainingError(
      "Training access is not configured. Set TRAIN_USER_ID on the server.",
      503,
    );
  if (user.id !== owner)
    throw new TrainingError(
      "This training space is private to its owner.",
      403,
    );
  return user;
}
