import { userClient, fail } from "@/lib/social/server";
/** The legacy one-shot upload is retired so every write has a durable session and cleanup manifest. */
export async function POST(req: Request) {
  try {
    await userClient(req);
    return Response.json(
      { error: "Use the resumable upload flow at /api/social/uploads" },
      { status: 410 },
    );
  } catch (e) {
    return fail(e);
  }
}
