"use client";
import { useState } from "react";
type Requester = (path: string, init?: RequestInit) => Promise<unknown>;
export function SocialUpload({
  productId,
  request,
  onComplete,
  disabled,
}: {
  productId: string;
  request: Requester;
  onComplete: () => Promise<void>;
  disabled: boolean;
}) {
  const [progress, setProgress] = useState(""),
    [running, setRunning] = useState(false);
  async function upload(form: HTMLFormElement) {
    const file = new FormData(form).get("file");
    if (!(file instanceof File) || !file.size || file.size > 8388608) {
      setProgress("Choose a JPEG or PNG up to 8 MB");
      return;
    }
    setRunning(true);
    try {
      const hash = Array.from(
        new Uint8Array(
          await crypto.subtle.digest("SHA-256", await file.arrayBuffer()),
        ),
      )
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const key = `social-upload:${productId}:${hash}`;
      let id = localStorage.getItem(key);
      if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem(key, id);
      }
      const start = (await request("/api/social/uploads?action=start", {
        method: "POST",
        body: JSON.stringify({
          id,
          product_id: productId,
          checksum: hash,
          bytes: file.size,
        }),
      })) as { state: string };
      if (start.state === "expired")
        throw new Error(
          "Session expired. Remove the expired session below and choose your file again.",
        );
      if (start.state !== "complete") {
        const status = (await request("/api/social/uploads?id=" + id)) as {
          parts: number[];
        };
        const count = Math.ceil(file.size / 1048576);
        for (let part = 0; part < count; part++) {
          setProgress(
            `Uploading part ${part + 1} of ${count}. Re-select the same file to resume after interruption.`,
          );
          if (status.parts.includes(part)) continue;
          const response = await request(
            `/api/social/uploads?action=part&id=${id}&part=${part}`,
            {
              method: "POST",
              body: file.slice(
                part * 1048576,
                Math.min(file.size, (part + 1) * 1048576),
              ),
              headers: { "Content-Type": "application/octet-stream" },
            },
          );
          if (!response) throw new Error("Part was not saved");
        }
        setProgress("Checking original image and checksum…");
        await request("/api/social/uploads?action=complete&id=" + id, {
          method: "POST",
        });
      }
      localStorage.removeItem(key);
      setProgress("Original uploaded and verified.");
      await onComplete();
    } catch (e) {
      setProgress(
        e instanceof Error
          ? e.message
          : "Upload interrupted; re-select the same file to resume.",
      );
    } finally {
      setRunning(false);
    }
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void upload(e.currentTarget);
      }}
    >
      <label>
        Resumable original image upload
        <input
          name="file"
          type="file"
          accept="image/jpeg,image/png"
          required
          disabled={disabled || running}
        />
      </label>
      <p>
        Maximum 8 MB. After interruption, re-select the same file to resume.
        Pending parts expire after 24 hours.
      </p>
      <button disabled={disabled || running}>Upload or resume original</button>
      <button
        type="button"
        disabled={running}
        onClick={() => {
          for (const k of Object.keys(localStorage))
            if (k.startsWith(`social-upload:${productId}:`))
              localStorage.removeItem(k);
          setProgress(
            "Local resume reference cleared. Server parts will expire automatically.",
          );
        }}
      >
        Forget local resume reference
      </button>
      <p role="status" aria-live="polite">
        {progress}
      </p>
    </form>
  );
}
