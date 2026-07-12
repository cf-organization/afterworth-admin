import { redirect } from "next/navigation";

// Root -> the first admin surface. Middleware gates it (redirects to /login if not an aal2 admin).
export default function Home() {
  redirect("/invitations");
}
