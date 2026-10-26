import { admin } from "./server";
/** Transactional email outbox. A timeout stays uncertain for operator review. */
export async function dispatchAlert() {
  if (!process.env.RESEND_API_KEY || !process.env.SOCIAL_ALERT_FROM) return;
  const db = admin();
  const { data, error } = await db.rpc("social_email_claim");
  if (error) throw new Error("Email outbox claim failed");
  const n = data?.[0];
  if (!n) return;
  let state = "uncertain";
  try {
    const { data: w } = await db
      .from("social_workspaces")
      .select("owner_id")
      .eq("id", n.workspace_id)
      .single();
    const { data: owner } = w
      ? await db.auth.admin.getUserById(w.owner_id)
      : { data: null };
    if (!owner?.user?.email) state = "failed";
    else {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        signal: AbortSignal.timeout(20000),
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `social-alert-${n.id}`,
        },
        body: JSON.stringify({
          from: process.env.SOCIAL_ALERT_FROM,
          to: [owner.user.email],
          subject: "Flologix Social delivery needs attention",
          text:
            n.message +
            "\nOpen your Social workspace to review the job and export a manual publishing package.",
        }),
      });
      state = r.ok ? "sent" : r.status < 500 ? "failed" : "uncertain";
    }
  } catch {
    /* Provider may have accepted the request. Do not resend automatically. */
  }
  const { error: write } = await db
    .from("social_notifications")
    .update({ email_state: state, email_lease: null, email_until: null })
    .eq("id", n.id)
    .eq("email_lease", n.email_lease);
  if (write)
    throw new Error("Email outcome could not be saved; reconcile outbox");
}
