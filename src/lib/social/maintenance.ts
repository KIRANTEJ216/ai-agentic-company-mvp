import { admin } from "./server";
export async function maintainSocial() {
  const db = admin();
  const { error: retention } = await db.rpc("social_maintenance");
  if (retention) throw new Error("Retention maintenance failed");
  const { data: objects, error } = await db
    .from("social_storage_cleanup")
    .select("*")
    .lt("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
    .order("created_at")
    .limit(20);
  if (error) throw new Error("Cleanup queue unavailable");
  for (const object of objects || []) {
    const { error: remove } = await db.storage
      .from("social-originals")
      .remove([object.object_key]);
    if (remove)
      await db
        .from("social_storage_cleanup")
        .update({
          attempts: object.attempts + 1,
          last_error: "Storage removal failed; will retry",
        })
        .eq("id", object.id);
    else await db.from("social_storage_cleanup").delete().eq("id", object.id);
  }
}
