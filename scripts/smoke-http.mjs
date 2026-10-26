import { spawn } from "node:child_process";
import assert from "node:assert/strict";
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--port",
    "3147",
    "--hostname",
    "127.0.0.1",
  ],
  {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      STRIPE_SECRET_KEY: "",
      STRIPE_WEBHOOK_SECRET: "",
      SOCIAL_WORKER_SECRET: "",
    },
  },
);
let logs = "";
child.stdout.on("data", (x) => (logs += x));
child.stderr.on("data", (x) => (logs += x));
try {
  let response;
  for (let i = 0; i < 50; i++) {
    try {
      response = await fetch("http://127.0.0.1:3147/social");
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  assert.ok(response, "Server did not become reachable: " + logs);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Social workspace/);
  const status = await fetch("http://127.0.0.1:3147/api/social");
  assert.equal((await status.json()).configured, false);
  const worker = await fetch("http://127.0.0.1:3147/api/social/worker", {
    method: "POST",
  });
  assert.equal(worker.status, 401);
  const webhook = await fetch("http://127.0.0.1:3147/api/stripe/webhook", {
    method: "POST",
    body: "{}",
  });
  assert.equal(webhook.status, 503);
  console.log(
    "PASS: social SSR, unconfigured status, worker auth, unsigned/unconfigured Stripe refusal",
  );
} finally {
  child.kill("SIGTERM");
}
