"use server";

import { redirect } from "next/navigation";
import { one } from "@/lib/db";
import { createSession, destroySession, getUser } from "@/lib/auth";
import { audit } from "@/lib/audit";

/** Demo sign-in: picks a seeded demo profile. Clearly labelled in the UI as not production auth. */
export async function signInAsDemo(formData: FormData) {
  // The picker lets anyone choose any demo role by design. Turn it off for anything beyond a demo.
  if (process.env.DEMO_ROLE_PICKER === "off") redirect("/login?error=disabled");
  const id = String(formData.get("user_id") ?? "");
  const user = await one<{ id: string; full_name: string; role: string; active: boolean }>(
    "select id, full_name, role, active from profiles where id = $1 and is_demo", [id]);
  if (!user || !user.active) redirect("/login?error=1");
  await createSession(user.id);
  await audit({ id: user.id, name: user.full_name, role: user.role as never }, "auth.sign_in", "profile", user.id, user.full_name, { method: "demo" });
  redirect("/");
}

export async function signOut() {
  const u = await getUser();
  if (u) await audit({ id: u.id, name: u.name, role: u.role }, "auth.sign_out", "profile", u.id, u.name);
  await destroySession();
  redirect("/login");
}
