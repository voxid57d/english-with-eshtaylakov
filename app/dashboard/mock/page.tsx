import { redirect } from "next/navigation";

export default function MockPage() {
   redirect("/dashboard/reading");
}
