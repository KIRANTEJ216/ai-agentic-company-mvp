const base = process.env.SOCIAL_WORKER_BASE_URL || "http://localhost:3000";
const secret = process.env.SOCIAL_WORKER_SECRET;
if (!secret || secret.length < 32)
  throw new Error(
    "Set SOCIAL_WORKER_SECRET with at least 32 random characters",
  );
let stopped = false;
process.on("SIGTERM", () => {
  stopped = true;
});
process.on("SIGINT", () => {
  stopped = true;
});
while (!stopped) {
  try {
    const r = await fetch(base + "/api/social/worker", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(110000),
    });
    console.log(new Date().toISOString(), "worker HTTP", r.status);
  } catch {
    console.error("Worker request failed; jobs remain durable");
  }
  await new Promise((resolve) => setTimeout(resolve, 15000));
}
