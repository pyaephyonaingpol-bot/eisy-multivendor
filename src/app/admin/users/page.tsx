import { createClient } from "@/lib/supabase/server";
import { setProfileRole } from "@/lib/disputes/actions";
import type { Profile, UserRole } from "@/lib/types/database";

export const dynamic = "force-dynamic";

async function changeRoleAction(formData: FormData) {
  "use server";
  const userId = String(formData.get("user_id") ?? "");
  const role = String(formData.get("role") ?? "") as UserRole;
  if (!userId || !["customer", "vendor", "admin"].includes(role)) return;
  await setProfileRole(userId, role);
}

export default async function AdminUsersPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  const profiles = (data as Pick<
    Profile,
    "id" | "email" | "full_name" | "role" | "created_at"
  >[] | null) ?? [];

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">User roles</h1>
        <p className="text-zinc-600">
          Promote or demote accounts (customer, vendor, admin). You cannot demote
          yourself.
        </p>
      </div>

      <ul className="divide-y divide-zinc-200 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        {profiles.map((profile) => (
          <li
            key={profile.id}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
          >
            <div>
              <p className="font-medium text-zinc-950">
                {profile.full_name || profile.email}
              </p>
              <p className="text-zinc-500">{profile.email}</p>
              <p className="text-xs text-zinc-400">
                Joined {new Date(profile.created_at).toLocaleDateString()}
              </p>
            </div>
            <form action={changeRoleAction} className="flex items-center gap-2">
              <input type="hidden" name="user_id" value={profile.id} />
              <select
                name="role"
                defaultValue={profile.role}
                className="rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
              >
                <option value="customer">customer</option>
                <option value="vendor">vendor</option>
                <option value="admin">admin</option>
              </select>
              <button
                type="submit"
                className="rounded-lg bg-zinc-950 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
              >
                Save
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
