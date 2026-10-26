import { createHash } from "node:crypto";
import sharp from "sharp";
import { admin, userClient, fail, readBounded } from "@/lib/social/server";
import { uploadType } from "@/lib/social/domain";
export const maxDuration = 120;
const digest = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
export async function GET(req: Request) {
  try {
    const { client } = await userClient(req);
    const id = new URL(req.url).searchParams.get("id");
    const { data: u, error } = await client
      .from("social_uploads")
      .select("*")
      .eq("id", id)
      .single();
    if (error || !u) throw new Error("Upload not found");
    const { data: parts, error: p } = await client
      .from("social_upload_parts")
      .select("part,uploaded")
      .eq("upload_id", id);
    if (p) throw new Error("Upload status unavailable");
    return Response.json(
      { upload: u, parts: parts?.filter((p) => p.uploaded).map((p) => p.part) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return fail(e);
  }
}
export async function POST(req: Request) {
  try {
    const { client, user } = await userClient(req),
      action = new URL(req.url).searchParams.get("action");
    if (action === "start") {
      const payload = JSON.parse(
        new TextDecoder().decode(await readBounded(req, 4096)),
      );
      const { data, error } = await client.rpc("social_upload_begin", {
        payload,
      });
      if (error) throw new Error(error.message);
      return Response.json(data);
    }
    const id = new URL(req.url).searchParams.get("id");
    const { data: u } = await client
      .from("social_uploads")
      .select("*")
      .eq("id", id)
      .single();
    if (!u || u.creator !== user.id) throw new Error("Upload not found");
    const db = admin(),
      prefix = `${u.workspace_id}/${u.product_id}/parts/${u.id}/`;
    if (action === "part") {
      const part = Number(new URL(req.url).searchParams.get("part"));
      if (!Number.isInteger(part)) throw new Error("Invalid part");
      const bytes = new Uint8Array(await readBounded(req, 1048576)),
        hash = digest(bytes);
      const { error } = await db.rpc("social_upload_part", {
        session_id: u.id,
        actor: user.id,
        part_index: part,
        part_hash: hash,
        part_bytes: bytes.byteLength,
      });
      if (error) throw new Error(error.message);
      const { error: upload } = await db.storage
        .from("social-originals")
        .upload(prefix + part, bytes, {
          contentType: "application/octet-stream",
          upsert: false,
        });
      if (upload && String(upload.statusCode) !== "409")
        throw new Error("Part upload failed; retry the same file");
      const { error: mark } = await db
        .from("social_upload_parts")
        .update({ uploaded: true })
        .eq("upload_id", u.id)
        .eq("part", part)
        .eq("checksum", hash);
      if (mark) throw new Error("Could not record uploaded part");
      return Response.json({ part, uploaded: true });
    }
    if (action !== "complete") throw new Error("Unknown upload operation");
    if (u.state === "complete") return Response.json({ complete: true });
    const { data: parts, error } = await client
      .from("social_upload_parts")
      .select("*")
      .eq("upload_id", u.id)
      .eq("uploaded", true)
      .order("part");
    if (error || !parts || parts.length !== Math.ceil(u.bytes / 1048576))
      throw new Error("Upload parts incomplete");
    const chunks: Buffer[] = [];
    for (const part of parts) {
      const { data: blob, error } = await db.storage
        .from("social-originals")
        .download(prefix + part.part);
      if (error || !blob)
        throw new Error("Stored part missing; upload it again");
      const bytes = Buffer.from(await blob.arrayBuffer());
      if (digest(bytes) !== part.checksum)
        throw new Error("Part checksum mismatch");
      chunks.push(bytes);
    }
    const bytes = Buffer.concat(chunks);
    if (bytes.length !== u.bytes || digest(bytes) !== u.checksum)
      throw new Error("File checksum mismatch; select the original file");
    const mime = uploadType(bytes),
      meta = await sharp(bytes, { limitInputPixels: 25000000 }).metadata();
    if (!meta.width || !meta.height || meta.width < 100 || meta.height < 100)
      throw new Error("Image must be at least 100 by 100 pixels");
    const key = `${u.workspace_id}/${u.product_id}/${u.id}.original`;
    const { error: store } = await db.storage
      .from("social-originals")
      .upload(key, bytes, { contentType: mime, upsert: false });
    if (store && String(store.statusCode) !== "409")
      throw new Error("Original save failed; retry completion");
    const { error: attach } = await db.rpc("social_upload_complete", {
      session_id: u.id,
      actor: user.id,
      object_path: key,
      mime_type: mime,
    });
    if (attach) throw new Error(attach.message);
    return Response.json({ complete: true, checksum: u.checksum });
  } catch (e) {
    return fail(e);
  }
}
