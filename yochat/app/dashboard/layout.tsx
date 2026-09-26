import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, verifyAdminToken } from "@/lib/admin-auth";
import { loadState } from "@/lib/store";

export default async function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  // Wave 9 (item 6): session validity is checked against the CURRENT admin
  // password hash (runtime override in state when set, else ADMIN_PASSWORD).
  const stateHash = (await loadState()).security.adminPasswordHash;
  if (!(await verifyAdminToken(cookieStore.get(ADMIN_COOKIE)?.value, async () => stateHash))) redirect("/login");
  return children;
}
