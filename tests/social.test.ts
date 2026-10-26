import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { csv, uploadType, deliveryOutcome } from "../src/lib/social/domain";

test("CSV escapes quotes, formulas and missing metrics", () => {
  assert.equal(
    csv([{ name: "=CMD()", metric: null, note: 'a"b' }]),
    '"name","metric","note"\r\n"\'=CMD()","","a""b"',
  );
  assert.throws(() => uploadType(new Uint8Array([60, 115, 118, 103])));
  assert.equal(deliveryOutcome(503, 1), "confirming");
  assert.equal(deliveryOutcome(429, 1), "scheduled");
  assert.equal(deliveryOutcome(429, 4), "failed");
});

test("PostgreSQL approval, roles, tenancy, budget and durable jobs", async () => {
  const db = new PGlite();
  await db.exec(
    `create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; create role authenticated; create role anon; create role service_role;`,
  );
  await db.exec(
    await readFile("supabase/migrations/202610260001_social.sql", "utf8"),
  );
  const owner = "00000000-0000-4000-8000-000000000001",
    other = "00000000-0000-4000-8000-000000000002",
    editor = "00000000-0000-4000-8000-000000000003";
  await db.query("insert into auth.users values ($1),($2),($3)", [
    owner,
    other,
    editor,
  ]);
  const login = async (id: string) => {
    await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [id]);
  };
  const command = async (
    action: string,
    payload: object,
  ): Promise<Record<string, unknown>> => {
    const r = await db.query<{ r: Record<string, unknown> }>(
      "select social_command($1,$2::jsonb) r",
      [action, JSON.stringify(payload)],
    );
    return r.rows[0].r;
  };
  await login(owner);
  const { id: w } = await command("workspace", { name: "Boutique" });
  const brand = await command("brand", {
    workspace_id: w,
    name: "Needle",
    facts: "Hyderabad boutique",
  });
  const product = await command("product", {
    workspace_id: w,
    brand_id: brand.id,
    name: "Silk blouse",
    facts: "Blue silk",
  });
  const variant = await command("draft", {
    workspace_id: w,
    product_id: product.id,
    channel: "instagram",
    caption: "Blue silk",
  });
  const base = { workspace_id: w, variant_id: variant.id };
  await assert.rejects(
    command("schedule", { ...base, scheduled_at: "2099-01-01" }),
    /Approve/,
  );
  await command("approve", { ...base, version: 1 });
  await command("schedule", { ...base, scheduled_at: "2099-01-01" });
  await command("edit", { ...base, version: 1, caption: "New detail" });
  await assert.rejects(command("approve", { ...base, version: 1 }), /changed/);
  await assert.rejects(
    command("schedule", { ...base, scheduled_at: "2099-01-01" }),
    /Approve/,
  );
  let r = await db.query<{ state: string }>("select state from social_jobs");
  assert.equal(r.rows[0].state, "cancelled");
  await command("member", { workspace_id: w, user_id: editor, role: "editor" });
  await login(editor);
  await assert.rejects(command("approve", { ...base, version: 2 }), /Reviewer/);
  await login(other);
  await assert.rejects(
    command("edit", { ...base, version: 2, caption: "stolen" }),
    /access denied/,
  );
  // RLS really filters reads; run as an unprivileged database role, not table owner.
  await db.exec(
    "grant usage on schema public,auth to authenticated; grant select on all tables in schema public to authenticated; set role authenticated;",
  );
  const hidden = await db.query("select * from social_products");
  assert.equal(hidden.rows.length, 0);
  await assert.rejects(
    db.query(`update social_variants set caption='bypass'`),
    /permission denied/,
  );
  await db.exec("reset role");
  await login(owner);
  const request = "10000000-0000-4000-8000-000000000001";
  await db.query("update social_workspaces set allowance=1 where id=$1", [w]);
  await command("reserve", {
    workspace_id: w,
    product_id: product.id,
    request_id: request,
  });
  await command("reserve", {
    workspace_id: w,
    product_id: product.id,
    request_id: request,
  });
  await assert.rejects(
    command("reserve", {
      workspace_id: w,
      product_id: product.id,
      request_id: "10000000-0000-4000-8000-000000000002",
    }),
    /exhausted/,
  );
  const start1 = await db.query<{ r: boolean }>(
    "select social_start_generation($1) r",
    [request],
  );
  const start2 = await db.query<{ r: boolean }>(
    "select social_start_generation($1) r",
    [request],
  );
  assert.equal(start1.rows[0].r, true);
  assert.equal(start2.rows[0].r, false);
  await db.query(`select social_settle($1,'{}',true)`, [request]);
  await db.query(`select social_settle($1,'{}',true)`, [request]);
  const budget = await db.query<{ allowance: number }>(
    "select allowance from social_workspaces",
  );
  assert.equal(budget.rows[0].allowance, 1);
  // Approval and publishing work even with exhausted AI allowance.
  await db.query("update social_workspaces set allowance=0 where id=$1", [w]);
  await command("approve", { ...base, version: 2 });
  await command("schedule", { ...base, scheduled_at: "2099-02-01" });
  await db.query(
    "update social_jobs set scheduled_at=now()-interval '1 second' where state='scheduled'",
  );
  await command("settings", { workspace_id: w, paused: true });
  assert.equal((await db.query("select * from social_claim()")).rows.length, 0);
  await command("settings", { workspace_id: w, paused: false });
  const claimed = await db.query<{ id: string; lease: string }>(
    "select * from social_claim()",
  );
  assert.equal(claimed.rows.length, 1);
  await assert.rejects(
    command("edit", { ...base, version: 2, caption: "Too late" }),
    /progress/,
  );
  await assert.rejects(
    db.query(
      "select social_finish($1,'00000000-0000-4000-8000-000000000000','published',null,null,null)",
      [claimed.rows[0].id],
    ),
    /Stale/,
  );
  await db.query(
    "update social_jobs set lease_until=now()-interval '1 second' where state='publishing'",
  );
  assert.equal((await db.query("select * from social_claim()")).rows.length, 0);
  r = await db.query("select state from social_jobs where id=$1", [
    claimed.rows[0].id,
  ]);
  assert.equal(r.rows[0].state, "confirming");
  await assert.rejects(command("retry", base), /retryable/);
  await db.close();
});

test("Meta adapter verifies evidence and never claims success after a lost response", async () => {
  const { publishMeta } = await import("../src/lib/social/publisher");
  process.env.SOCIAL_META_API_VERSION = "v99.0"; // test URL shape only; not a claimed supported live version
  const input = {
    channel: "facebook",
    caption: "Approved",
    imageUrl: "https://storage.example/original.jpg",
    connection: { account_id: "123", access_token: "test" },
  };
  let calls = 0;
  const success = (async () => {
    calls++;
    return Response.json(
      calls === 1
        ? { post_id: "post123" }
        : { id: "post123", permalink_url: "https://www.facebook.com/post123" },
    );
  }) as typeof fetch;
  assert.equal((await publishMeta(input, success)).state, "published");
  assert.equal(calls, 2);
  const timeout = (async () => {
    throw new Error("response lost");
  }) as typeof fetch;
  assert.equal((await publishMeta(input, timeout)).state, "confirming");
  let instagramCalls = 0;
  const notReady = (async () => {
    instagramCalls++;
    return Response.json(
      instagramCalls === 1
        ? { id: "container" }
        : { status_code: "IN_PROGRESS" },
    );
  }) as typeof fetch;
  assert.equal(
    (await publishMeta({ ...input, channel: "instagram" }, notReady)).state,
    "failed",
  );
  assert.equal(instagramCalls, 2);
  delete process.env.SOCIAL_META_API_VERSION;
});

test("Request body limits apply without trusting Content-Length", async () => {
  const { readBounded } = await import("../src/lib/social/server");
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("oversized"));
      controller.close();
    },
  });
  const req = new Request("https://example.test", {
    method: "POST",
    body,
    duplex: "half",
  } as RequestInit);
  await assert.rejects(readBounded(req, 3), /too large/);
});
