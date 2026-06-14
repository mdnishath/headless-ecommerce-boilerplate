import { getCurrentAdmin } from "@core/auth/current-admin";
import { logoutAction } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const admin = await getCurrentAdmin();

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Studio</h1>
        <form action={logoutAction}>
          <button type="submit" className="text-sm text-muted-foreground hover:underline">
            Sign out
          </button>
        </form>
      </div>
      <p className="mt-4 text-muted-foreground">
        Signed in as {admin?.email}. The customizer UI lands in Studio-0b-iii.
      </p>
    </main>
  );
}
