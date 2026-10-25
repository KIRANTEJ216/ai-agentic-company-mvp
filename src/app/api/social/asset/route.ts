import { userClient, admin, fail } from "@/lib/social/server";
export async function GET(req: Request) {
  try {
    const { client } = await userClient(req);
    const id = new URL(req.url).searchParams.get("product_id");
    const { data: p } = await client
      .from("social_products")
      .select("object_key")
      .eq("id", id)
      .single();
    if (!p?.object_key) throw new Error("Original image unavailable");
    const { data, error } = await admin()
      .storage.from("social-originals")
      .createSignedUrl(p.object_key, 60);
    if (error) throw new Error("Image unavailable");
    return Response.json(
      { url: data.signedUrl },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return fail(e);
  }
}
