import { signOut } from "@/lib/auth/actions";

export function SignOutButton() {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className="rounded-full border border-zinc-200 px-4 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
      >
        Sign out
      </button>
    </form>
  );
}
