import { redirect } from "next/navigation";

/** `/admin` → overview dashboard. */
export default function AdminIndexPage() {
  redirect("/admin/dashboard");
}
