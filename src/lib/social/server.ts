import { createClient } from "@supabase/supabase-js";

export function configured() {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
export function admin() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !configured())
    throw new Error("Supabase server is unconfigured");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) =>
          fetch(input, {
            ...init,
            signal: init?.signal ?? AbortSignal.timeout(30000),
          }),
      },
    },
  );
}
export async function userClient(req: Request) {
  if (!configured())
    throw new Error("Supabase is unconfigured; see docs/SOCIAL_SETUP.md");
  const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new Error("Sign in required");
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: { Authorization: `Bearer ${token}` },
        fetch: (input, init) =>
          fetch(input, {
            ...init,
            signal: init?.signal ?? AbortSignal.timeout(30000),
          }),
      },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new Error("Sign in required");
  return { client, user: data.user };
}
export function fail(error: unknown) {
  const message = error instanceof Error ? error.message : "Request failed";
  const auth = message === "Sign in required";
  return Response.json(
    { error: message },
    { status: auth ? 401 : 400, headers: { "Cache-Control": "no-store" } },
  );
}
export async function command(
  req: Request,
  action: string,
  payload: Record<string, unknown>,
) {
  const { client } = await userClient(req);
  const { data, error } = await client.rpc("social_command", {
    action,
    payload,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function readBounded(
  req: Request,
  limit: number,
): Promise<ArrayBuffer> {
  if (Number(req.headers.get("content-length") || 0) > limit)
    throw new Error("Request too large");
  const reader = req.body?.getReader();
  if (!reader) return new ArrayBuffer(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new Error("Request too large");
    }
    chunks.push(value);
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output.buffer;
}
