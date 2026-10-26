import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { userClient, admin, fail, readBounded } from "@/lib/social/server";
import { uploadType } from "@/lib/social/domain";
export async function POST(req: Request) {
  try {
    const { client } = await userClient(req);
    if (Number(req.headers.get("content-length") || 0) > 9 * 1024 * 1024)
      throw new Error("Maximum file size is 8 MB");
    const raw = await readBounded(req, 9 * 1024 * 1024);
    const form = await new Response(raw, {
      headers: { "Content-Type": req.headers.get("content-type") || "" },
    }).formData();
    const file = form.get("file");
    const productId = String(form.get("product_id"));
    if (!(file instanceof File) || file.size > 8 * 1024 * 1024)
      throw new Error("Choose an image up to 8 MB");
    const { data: p } = await client
      .from("social_products")
      .select("*")
      .eq("id", productId)
      .single();
    if (!p) throw new Error("Product not found");
    const { data: role } = await client.rpc("social_role", {
      w: p.workspace_id,
    });
    if (!["owner", "editor"].includes(role)) throw new Error("Editor required");
    const bytes = Buffer.from(await file.arrayBuffer());
    const mime = uploadType(bytes);
    const metadata = await sharp(bytes, {
      limitInputPixels: 25000000,
    }).metadata();
    if (
      !metadata.width ||
      !metadata.height ||
      metadata.width < 100 ||
      metadata.height < 100
    )
      throw new Error("Image must be at least 100 by 100 pixels");
    const checksum = createHash("sha256").update(bytes).digest("hex");
    const key = `${p.workspace_id}/${p.id}/${randomUUID()}.${mime === "image/png" ? "png" : "jpg"}`;
    const store = admin();
    const { error } = await store.storage
      .from("social-originals")
      .upload(key, bytes, { contentType: mime, upsert: false });
    if (error)
      throw new Error("Storage upload failed; verify private bucket setup");
    const { error: attach } = await client.rpc("social_command", {
      action: "asset",
      payload: {
        workspace_id: p.workspace_id,
        product_id: p.id,
        object_key: key,
        checksum,
        mime,
      },
    });
    if (attach) {
      await store.storage.from("social-originals").remove([key]);
      throw new Error(attach.message);
    }
    return Response.json({ checksum, mime });
  } catch (e) {
    return fail(e);
  }
}
