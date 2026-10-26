export const maxDuration = 120;
import { dispatchAlert } from "@/lib/social/alerts";
import { timingSafeEqual } from "node:crypto";
import { admin, fail } from "@/lib/social/server";
import { connection, publishMeta, Outcome } from "@/lib/social/publisher";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    const secret = process.env.SOCIAL_WORKER_SECRET,
      got = req.headers.get("authorization")?.replace(/^Bearer /, "") || "";
    if (
      !secret ||
      secret.length < 32 ||
      Buffer.byteLength(got) !== Buffer.byteLength(secret) ||
      !timingSafeEqual(Buffer.from(got), Buffer.from(secret))
    )
      return Response.json({ error: "Unauthorised" }, { status: 401 });
    try {
      await dispatchAlert();
    } catch {
      console.error("Email outbox requires attention");
    }
    const db = admin();
    const { data, error } = await db.rpc("social_claim");
    if (error) throw new Error(error.message);
    const job = data?.[0];
    if (!job) return Response.json({ processed: 0 });
    let result: Outcome = {
      state: "failed",
      detail:
        "Live publishing is not configured. Export the post for manual publication.",
      id: null,
      url: null,
    };
    const { data: v } = await db
      .from("social_variants")
      .select("*")
      .eq("id", job.variant_id)
      .single();
    const { data: w } = await db
      .from("social_workspaces")
      .select("*")
      .eq("id", job.workspace_id)
      .single();
    if (
      v &&
      w &&
      !w.paused &&
      v.version === job.version &&
      v.approved_version === job.version
    ) {
      const c = connection(job.workspace_id, v.channel);
      if (c && process.env.SOCIAL_LIVE_PUBLISHING === "true") {
        const { data: p } = await db
          .from("social_products")
          .select("*")
          .eq("id", v.product_id)
          .single();
        if (!p?.object_key)
          result.detail = "Original image required for publishing.";
        else if (v.channel === "instagram" && p.mime !== "image/jpeg")
          result.detail =
            "Instagram adapter requires an original JPEG. Export PNG manually or create a JPEG product.";
        else {
          const { data: asset } = await db.storage
            .from("social-originals")
            .createSignedUrl(p.object_key, 900);
          if (asset)
            result = await publishMeta({
              channel: v.channel,
              caption: v.caption,
              imageUrl: asset.signedUrl,
              connection: c,
            });
          else result.detail = "Original image is unavailable.";
        }
      }
    } else
      result.detail = "Approval invalidated or workspace paused before send.";
    const { error: finish } = await db.rpc("social_finish", {
      job_id: job.id,
      lease_id: job.lease,
      outcome: result.state,
      detail: result.detail,
      remote: result.id,
      url: result.url,
    });
    if (finish)
      throw new Error(
        "Could not record delivery outcome; leave for reconciliation",
      );
    return Response.json({ processed: 1, state: result.state });
  } catch (e) {
    return fail(e);
  }
}
