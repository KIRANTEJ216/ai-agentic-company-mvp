/** Meta Facebook Login adapter. Server credentials only; no browser token exposure.
 * Official contract: https://www.postman.com/meta/instagram/overview
 * Live verification remains mandatory before enabling an account. */
export type Connection = { account_id: string; access_token: string };
export function connection(
  workspace: string,
  channel: string,
): Connection | null {
  const config = JSON.parse(process.env.SOCIAL_META_CONNECTIONS || "{}");
  const c = config[workspace]?.[channel];
  return c && /^\d+$/.test(c.account_id) && typeof c.access_token === "string"
    ? c
    : null;
}
export type Outcome = {
  state: "published" | "failed" | "confirming";
  detail: string | null;
  id: string | null;
  url: string | null;
};
export async function publishMeta(
  input: {
    channel: string;
    caption: string;
    imageUrl: string;
    connection: Connection;
  },
  fetcher: typeof fetch = fetch,
): Promise<Outcome> {
  const version = process.env.SOCIAL_META_API_VERSION;
  if (!version || !/^v\d+\.\d+$/.test(version))
    return {
      state: "failed",
      detail: "Set a supported Meta API version before publishing.",
      id: null,
      url: null,
    };
  let remote: string | null = null;
  async function graph(
    path: string,
    method: string,
    params: Record<string, string>,
  ) {
    const url = new URL(`https://graph.facebook.com/${version}/${path}`);
    const options: RequestInit = {
      method,
      headers: { Authorization: `Bearer ${input.connection.access_token}` },
      signal: AbortSignal.timeout(25000),
    };
    if (method === "GET") {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    } else {
      options.body = new URLSearchParams(params);
    }
    const res = await fetcher(url, options);
    if (!res.ok)
      throw new Error(
        "Meta rejected the operation. Check account permissions and reconcile before retrying.",
      );
    return res.json();
  }
  try {
    const account = input.connection.account_id;
    if (input.channel === "instagram") {
      const container = await graph(account + "/media", "POST", {
        image_url: input.imageUrl,
        caption: input.caption,
      });
      if (!container.id) throw new Error("No container ID");
      const ready = await graph(container.id, "GET", { fields: "status_code" });
      if (ready.status_code !== "FINISHED")
        return {
          state: "failed",
          detail:
            "Instagram image container not ready. No publish call made; review media and retry.",
          id: null,
          url: null,
        };
      const sent = await graph(account + "/media_publish", "POST", {
        creation_id: container.id,
      });
      remote = sent.id;
    } else if (input.channel === "facebook") {
      const sent = await graph(account + "/photos", "POST", {
        url: input.imageUrl,
        caption: input.caption,
        published: "true",
      });
      remote = sent.post_id || sent.id;
    } else
      return {
        state: "failed",
        detail: "Unsupported channel",
        id: null,
        url: null,
      };
    if (!remote) throw new Error("No remote ID returned");
    const proof = await graph(remote, "GET", {
      fields:
        input.channel === "instagram"
          ? "id,permalink,timestamp"
          : "id,permalink_url,created_time",
    });
    const link = proof.permalink || proof.permalink_url;
    if (!proof.id || typeof link !== "string" || !/^https:\/\//.test(link))
      throw new Error("Publication proof unavailable");
    return { state: "published", detail: null, id: remote, url: link };
  } catch {
    // A request may have succeeded even when its response was lost. Never auto-resend.
    return {
      state: "confirming",
      detail:
        "Meta outcome uncertain. Operator must check the destination before resolving. Do not blindly retry.",
      id: remote,
      url: null,
    };
  }
}
