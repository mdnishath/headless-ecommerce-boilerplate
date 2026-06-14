import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@core/auth/current-admin";
import { getDraft } from "@core/studio/actions";
import { registryMeta } from "@core/studio/registry-meta";
import { Customizer } from "@/components/studio/customizer";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const admin = await getCurrentAdmin();
  if (!admin) {
    redirect("/admin/login");
  }
  const doc = await getDraft();
  const meta = registryMeta();
  return <Customizer initialDoc={doc} headerVariants={meta.header ?? []} />;
}
