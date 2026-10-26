import {
  userClient,
  command,
  fail,
  configured,
  readBounded,
} from "@/lib/social/server";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    if (!configured())
      return Response.json(
        {
          configured: false,
          workspaces: [],
          capabilities: { publishing: "unconfigured" },
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    const { client, user } = await userClient(req);
    const names = [
      "workspaces",
      "members",
      "brands",
      "products",
      "variants",
      "jobs",
      "usage",
      "enquiries",
      "notifications",
      "metrics",
      "reviews",
    ];
    const rows = await Promise.all(
      names.map(async (name) => {
        const { data, error } = await client
          .from("social_" + name)
          .select("*")
          .limit(501);
        if (error) throw new Error(error.message);
        if (data && data.length > 500)
          throw new Error(
            "Pilot record limit reached. Export/archive records before continuing; pagination is required for larger deployments.",
          );
        return [name, data];
      }),
    );
    return Response.json(
      {
        configured: true,
        user_id: user.id,
        ...Object.fromEntries(rows),
        capabilities: {
          publishing:
            process.env.SOCIAL_LIVE_PUBLISHING === "true"
              ? "Meta adapter enabled. Per-workspace credentials required; live verification is recorded on each job."
              : "Manual export available. Live publishing disabled.",
          ai:
            process.env.SOCIAL_OPENROUTER_API_KEY && process.env.SOCIAL_AI_MODEL
              ? "configured, not live verified"
              : "unconfigured",
          metrics:
            "No live analytics adapter. Missing metrics are unavailable.",
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return fail(e);
  }
}
export async function POST(req: Request) {
  try {
    const raw = new TextDecoder().decode(await readBounded(req, 20000));
    if (raw.length > 20000) throw new Error("Request too large");
    const { action, payload } = JSON.parse(raw);
    if (typeof action !== "string" || !payload || typeof payload !== "object")
      throw new Error("Invalid command");
    return Response.json(await command(req, action, payload), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return fail(e);
  }
}
