import { signOut } from "@/lib/auth/actions";

type SignOutButtonProps = {
  className?: string;
};

export function SignOutButton({ className = "" }: SignOutButtonProps) {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className={
          className ||
          "rounded-full border border-zinc-200 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50 sm:px-4 sm:text-sm"
        }
      >
        Sign out
      </button>
    </form>
  );
}
