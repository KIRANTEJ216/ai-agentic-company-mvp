"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState, useCallback } from "react";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { csv } from "@/lib/social/domain";
import { artwork } from "@/lib/social/artwork";
import { SocialCalendar } from "@/components/social-calendar";
import { SocialUpload } from "@/components/social-upload";
import "./social.css";

type Workspace = {
  id: string;
  name: string;
  allowance: number;
  paused: boolean;
  enquiry_retention_days: number | null;
};
type Brand = {
  version: number;
  id: string;
  workspace_id: string;
  name: string;
  facts: string;
  voice: string;
  locale: string;
  timezone: string;
};
type Product = {
  version: number;
  id: string;
  workspace_id: string;
  brand_id: string;
  name: string;
  facts: string;
  object_key: string | null;
  checksum: string | null;
};
type Variant = {
  id: string;
  workspace_id: string;
  product_id: string;
  channel: string;
  caption: string;
  version: number;
  approved_version: number | null;
  state: string;
  content_hash: string;
};
type Job = {
  id: string;
  workspace_id: string;
  variant_id: string;
  version: number;
  scheduled_at: string;
  state: string;
  error: string | null;
  remote_url: string | null;
};
type Enquiry = {
  id: string;
  workspace_id: string;
  name: string;
  contact: string;
  stage: string;
  follow_up: string | null;
  source: string;
};
type Usage = {
  id: string;
  workspace_id: string;
  state: string;
  units: number;
  created_at: string;
  started_at: string | null;
};
type Notice = {
  id: string;
  workspace_id: string;
  message: string;
  read_by: string[];
  dismissed_by: string[];
};
type Metric = {
  id: string;
  workspace_id: string;
  metric: string;
  value: number | null;
  definition: string;
  observed_at: string;
};
type Review = {
  id: string;
  workspace_id: string;
  variant_id: string;
  version: number;
  kind: string;
  message: string;
  created_at: string;
};
type Data = {
  configured: boolean;
  user_id?: string;
  workspaces: Workspace[];
  members: { workspace_id: string; user_id: string; role: string }[];
  brands: Brand[];
  products: Product[];
  variants: Variant[];
  jobs: Job[];
  enquiries: Enquiry[];
  usage: Usage[];
  notifications: Notice[];
  metrics: Metric[];
  reviews: Review[];
  capabilities?: { publishing: string; ai: string; metrics: string };
};
const empty: Data = {
  configured: false,
  workspaces: [],
  members: [],
  brands: [],
  products: [],
  variants: [],
  jobs: [],
  enquiries: [],
  usage: [],
  notifications: [],
  metrics: [],
  reviews: [],
};
const tabs = [
  "Today",
  "Create",
  "Calendar",
  "Enquiries",
  "Results",
  "Settings",
];
function download(name: string, text: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function fields(form: HTMLFormElement) {
  return Object.fromEntries(new FormData(form).entries());
}
function ImagePreview({
  client,
  product,
}: {
  client: SupabaseClient;
  product: Product;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let active = true;
    async function load() {
      const { data } = await client.auth.getSession();
      const r = await fetch("/api/social/asset?product_id=" + product.id, {
        headers: { Authorization: `Bearer ${data.session?.access_token}` },
      });
      const body = await r.json();
      if (active) setUrl(body.url || "");
    }
    if (product.object_key) void load();
    return () => {
      active = false;
    };
  }, [client, product.id, product.object_key]);
  return url ? (
    <img className="social-image" src={url} alt={"Original " + product.name} />
  ) : (
    <div className="social-placeholder">
      Original image not uploaded or unavailable
    </div>
  );
}
export default function SocialPage() {
  const [client] = useState(() =>
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      ? createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        )
      : null,
  );
  const [signed, setSigned] = useState(false),
    [data, setData] = useState<Data>(empty),
    [workspace, setWorkspace] = useState(""),
    [tab, setTab] = useState("Today"),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [draft, setDraft] = useState<Record<string, string>>({}),
    [productId, setProductId] = useState(""),
    [channelFilter, setChannelFilter] = useState("all"),
    [search, setSearch] = useState("");
  const request = useCallback(
    async (path: string, init: RequestInit = {}) => {
      const { data: session } = client
        ? await client.auth.getSession()
        : { data: { session: null } };
      const r = await fetch(path, {
        ...init,
        headers: {
          ...(init.body instanceof FormData
            ? {}
            : { "Content-Type": "application/json" }),
          Authorization: `Bearer ${session.session?.access_token || ""}`,
          ...init.headers,
        },
        cache: "no-store",
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || "Request failed");
      return body;
    },
    [client],
  );
  const reload = useCallback(async () => {
    const result = await request("/api/social");
    setData(result);
    setWorkspace((current) =>
      result.workspaces?.some((w: Workspace) => w.id === current)
        ? current
        : result.workspaces?.[0]?.id || "",
    );
  }, [request]);
  useEffect(() => {
    if (!client) return;
    void client.auth.getSession().then(({ data }) => {
      setSigned(!!data.session);
      if (data.session) void reload().catch((e) => setNotice(e.message));
    });
    const { data: listener } = client.auth.onAuthStateChange(
      (_event, session) => {
        setSigned(!!session);
        if (session)
          setTimeout(() => void reload().catch((e) => setNotice(e.message)), 0);
        else setData(empty);
      },
    );
    return () => listener.subscription.unsubscribe();
  }, [client, reload]);
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setNotice("");
    try {
      await fn();
      await reload();
      setNotice("Saved.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  async function cmd(action: string, payload: Record<string, unknown>) {
    return request("/api/social", {
      method: "POST",
      body: JSON.stringify({
        action,
        payload: { workspace_id: workspace, ...payload },
      }),
    });
  }
  function form(action: string, extra: Record<string, unknown> = {}) {
    return (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const f = e.currentTarget;
      void run(async () => {
        await cmd(action, { ...fields(f), ...extra });
        f.reset();
      });
    };
  }
  const w = data.workspaces.find((w) => w.id === workspace),
    role = data.members.find(
      (m) => m.workspace_id === workspace && m.user_id === data.user_id,
    )?.role;
  const local = <T extends { workspace_id: string }>(rows: T[]) =>
    rows.filter((x) => x.workspace_id === workspace);
  const brands = local(data.brands),
    products = local(data.products),
    variants = local(data.variants),
    jobs = local(data.jobs),
    enquiries = local(data.enquiries),
    usage = local(data.usage),
    metrics = local(data.metrics);
  const selectedProduct = products.find((p) => p.id === productId);
  return (
    <div className="social-app">
      <header className="social-header">
        <div>
          <p className="social-eyebrow">FLOLOGIX AUTOMATIONS</p>
          <h1>Social workspace</h1>
          <p>Accurate content. Clear approvals. Visible delivery.</p>
        </div>
        <span className="social-badge">
          Pilot • {signed ? "Authenticated" : "Setup"}
        </span>
      </header>
      <p role="status" aria-live="polite" className="social-notice">
        {busy
          ? "Working…"
          : notice ||
            "Original product assets stay unchanged. No automatic public posting without an approved version."}
      </p>
      {!client ? (
        <section className="social-panel">
          <h2>Connect Supabase to begin</h2>
          <p>
            No demo data or publication results are being presented. Set the
            public Supabase URL and anonymous key, apply the migration, and
            create the private storage bucket using docs/SOCIAL_SETUP.md.
          </p>
        </section>
      ) : !signed ? (
        <section className="social-panel">
          <h2>Sign in to your workspace</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const values = fields(e.currentTarget);
              setBusy(true);
              void client.auth
                .signInWithPassword({
                  email: String(values.email),
                  password: String(values.password),
                })
                .then(({ error }) => {
                  setBusy(false);
                  if (error) setNotice(error.message);
                });
            }}
          >
            <label>
              Email
              <input name="email" type="email" autoComplete="email" required />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                minLength={8}
              />
            </label>
            <button disabled={busy}>Sign in</button>
            <button
              type="button"
              disabled={busy}
              onClick={(e) => {
                const values = fields(e.currentTarget.form!);
                void client.auth
                  .signUp({
                    email: String(values.email),
                    password: String(values.password),
                  })
                  .then(({ error }) =>
                    setNotice(
                      error?.message ||
                        "Account requested. Check your email for confirmation before signing in.",
                    ),
                  );
              }}
            >
              Create account
            </button>
          </form>
        </section>
      ) : (
        <>
          <div className="social-toolbar">
            <label>
              Workspace
              <select
                value={workspace}
                onChange={(e) => setWorkspace(e.target.value)}
              >
                <option value="">Choose workspace</option>
                {data.workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
            <span>
              {role || "No workspace"}{" "}
              {w && `• ${w.allowance} generation units available`}
            </span>
            <button disabled={busy} onClick={() => void run(reload)}>
              Refresh
            </button>
            <button onClick={() => void client.auth.signOut()}>Sign out</button>
          </div>
          {!w ? (
            <section className="social-panel">
              <h2>Create your pilot workspace</h2>
              <form onSubmit={form("workspace")}>
                <label>
                  Workspace name
                  <input name="name" required maxLength={120} />
                </label>
                <button disabled={busy}>Create workspace</button>
              </form>
            </section>
          ) : (
            <>
              <nav aria-label="Social sections" className="social-tabs">
                {tabs.map((t) => (
                  <button
                    key={t}
                    aria-current={tab === t ? "page" : undefined}
                    onClick={() => setTab(t)}
                  >
                    {t}
                  </button>
                ))}
              </nav>
              {tab === "Today" && (
                <>
                  <section className="social-stats">
                    <div>
                      <strong>
                        {
                          variants.filter(
                            (v) => v.approved_version !== v.version,
                          ).length
                        }
                      </strong>
                      Need review
                    </div>
                    <div>
                      <strong>
                        {jobs.filter((j) => j.state === "scheduled").length}
                      </strong>
                      Scheduled jobs
                    </div>
                    <div>
                      <strong>
                        {
                          jobs.filter((j) =>
                            ["failed", "confirming"].includes(j.state),
                          ).length
                        }
                      </strong>
                      Need attention
                    </div>
                    <div>
                      <strong>
                        {
                          enquiries.filter((e) =>
                            ["new", "qualified"].includes(e.stage),
                          ).length
                        }
                      </strong>
                      Open enquiries
                    </div>
                  </section>
                  <section className="social-panel">
                    <h2>Delivery and connection health</h2>
                    <p>{data.capabilities?.publishing}</p>
                    <p>
                      AI: {data.capabilities?.ai}.{" "}
                      {w.paused
                        ? "Publishing is paused."
                        : "Workspace publishing is enabled; live connection is still required."}
                    </p>
                    {local(data.notifications)
                      .filter(
                        (n) => !n.dismissed_by.includes(data.user_id || ""),
                      )
                      .map((n) => (
                        <p className="social-warning" key={n.id}>
                          {n.message}{" "}
                          {n.read_by.includes(data.user_id || "")
                            ? "(Read)"
                            : "(Unread)"}
                          <button
                            disabled={busy}
                            onClick={() =>
                              void run(() => cmd("notice_read", { id: n.id }))
                            }
                          >
                            Mark read
                          </button>
                          <button
                            disabled={busy}
                            onClick={() =>
                              void run(() =>
                                cmd("notice_dismiss", { id: n.id }),
                              )
                            }
                          >
                            Dismiss for me
                          </button>
                        </p>
                      ))}
                    <button onClick={() => setTab("Create")}>
                      Create your next post
                    </button>
                  </section>
                </>
              )}
              {tab === "Settings" && (
                <>
                  <section className="social-panel">
                    <h2>Brand knowledge</h2>
                    <p>
                      Only enter facts you confirm as accurate. Missing prices
                      or availability will not be invented.
                    </p>
                    <form onSubmit={form("brand")}>
                      <label>
                        Brand name
                        <input name="name" required maxLength={120} />
                      </label>
                      <label>
                        Confirmed facts
                        <textarea name="facts" required maxLength={6000} />
                      </label>
                      <label>
                        Voice
                        <input
                          name="voice"
                          placeholder="Warm, confident, no hard sell"
                          maxLength={500}
                        />
                      </label>
                      <label>
                        Draft language
                        <select name="locale">
                          <option>English</option>
                          <option>Telugu</option>
                        </select>
                      </label>
                      <label>
                        Timezone
                        <input
                          name="timezone"
                          defaultValue="Asia/Kolkata"
                          required
                        />
                      </label>
                      <button disabled={busy || role === "reviewer"}>
                        Save brand
                      </button>
                    </form>
                    {brands.map((b) => (
                      <article key={`${b.id}:${b.version}`}>
                        <h3>{b.name}</h3>
                        <p>{b.facts}</p>
                        <details>
                          <summary>Edit confirmed facts</summary>
                          <p>
                            Changing facts cancels affected schedules and
                            requires fresh review. Captions are not rewritten.
                          </p>
                          <form
                            onSubmit={form("brand_edit", {
                              id: b.id,
                              version: b.version,
                            })}
                          >
                            <label>
                              Brand name
                              <input
                                name="name"
                                required
                                maxLength={120}
                                defaultValue={b.name}
                              />
                            </label>
                            <label>
                              Confirmed facts
                              <textarea
                                name="facts"
                                required
                                maxLength={6000}
                                defaultValue={b.facts}
                              />
                            </label>
                            <button disabled={busy || role === "reviewer"}>
                              Save fact version {b.version + 1}
                            </button>
                          </form>
                        </details>
                        <small>
                          {b.locale} • {b.timezone}
                        </small>
                      </article>
                    ))}
                  </section>
                  {role === "owner" && (
                    <section className="social-panel">
                      <h2>Workspace controls</h2>
                      <button
                        disabled={busy}
                        onClick={() =>
                          void run(() => cmd("settings", { paused: !w.paused }))
                        }
                      >
                        {w.paused ? "Resume publishing" : "Pause publishing"}
                      </button>
                      <h3>Enquiry retention</h3>
                      <p>
                        Automatically delete owner-entered enquiries older than
                        this period, regardless of stage. Disabled by default.
                        Runs when the worker polls.
                      </p>
                      <form onSubmit={form("retention")}>
                        <label>
                          Retention period
                          <select
                            name="days"
                            defaultValue={w.enquiry_retention_days || ""}
                          >
                            <option value="">
                              Keep until manually deleted
                            </option>
                            <option value="30">30 days</option>
                            <option value="90">90 days</option>
                            <option value="365">365 days</option>
                          </select>
                        </label>
                        <button disabled={busy}>Save retention policy</button>
                      </form>
                      <h3>Delete workspace</h3>
                      <p>
                        This removes access immediately, cancels pending
                        schedules, and queues permanent records and storage
                        cleanup after a 10 minute quarantine. Published social
                        posts and backups are not deleted. This cannot be undone
                        in the app.
                      </p>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const values = fields(e.currentTarget);
                          void run(() => cmd("delete_workspace", values));
                        }}
                      >
                        <label>
                          Type {w.name} to request permanent deletion
                          <input
                            name="confirm_name"
                            required
                            autoComplete="off"
                          />
                        </label>
                        <button disabled={busy}>
                          Request permanent workspace deletion
                        </button>
                      </form>
                      <h3>Add existing user</h3>
                      <p>
                        Use the Supabase Auth user UUID of a team member who has
                        already registered.
                      </p>
                      <form onSubmit={form("member")}>
                        <label>
                          User UUID
                          <input name="user_id" required />
                        </label>
                        <label>
                          Role
                          <select name="role">
                            <option value="editor">Editor</option>
                            <option value="reviewer">Reviewer</option>
                          </select>
                        </label>
                        <button disabled={busy}>Save membership</button>
                      </form>
                    </section>
                  )}
                </>
              )}
              {tab === "Create" && (
                <>
                  <section className="social-panel">
                    <h2>1. Add a product</h2>
                    <form onSubmit={form("product")}>
                      <label>
                        Brand
                        <select name="brand_id" required>
                          <option value="">Choose brand</option>
                          {brands.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Product name
                        <input name="name" required maxLength={120} />
                      </label>
                      <label>
                        Confirmed product facts
                        <textarea name="facts" required maxLength={6000} />
                      </label>
                      <button disabled={busy || role === "reviewer"}>
                        Save product
                      </button>
                    </form>
                  </section>
                  <section className="social-panel">
                    <h2>2. Original image and draft</h2>
                    <label>
                      Product
                      <select
                        value={productId}
                        onChange={(e) => {
                          setProductId(e.target.value);
                          setDraft({});
                        }}
                      >
                        <option value="">Choose product</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {selectedProduct && (
                      <>
                        <ImagePreview
                          client={client}
                          product={selectedProduct}
                        />
                        <p>{selectedProduct.facts}</p>
                        <details>
                          <summary>Edit product facts</summary>
                          <p>
                            Changing facts cancels affected schedules and
                            requires fresh review.
                          </p>
                          <form
                            key={`${selectedProduct.id}:${selectedProduct.version}`}
                            onSubmit={form("product_edit", {
                              id: selectedProduct.id,
                              version: selectedProduct.version,
                            })}
                          >
                            <label>
                              Product name
                              <input
                                name="name"
                                required
                                maxLength={120}
                                defaultValue={selectedProduct.name}
                              />
                            </label>
                            <label>
                              Confirmed facts
                              <textarea
                                name="facts"
                                required
                                maxLength={6000}
                                defaultValue={selectedProduct.facts}
                              />
                            </label>
                            <button disabled={busy || role === "reviewer"}>
                              Save fact version {selectedProduct.version + 1}
                            </button>
                          </form>
                        </details>
                        <SocialUpload
                          productId={productId}
                          request={request}
                          onComplete={reload}
                          disabled={busy || role === "reviewer"}
                        />
                        <small>
                          Image is locked after the first draft. Create another
                          product to change it.
                        </small>
                        <p>
                          Generate two editable captions for 1 pilot unit. This
                          is an app allowance, not a quoted provider currency
                          cost. Review before saving.
                        </p>
                        <button
                          disabled={busy || role === "reviewer"}
                          onClick={() =>
                            void run(async () => {
                              const key =
                                "social-generation-" + selectedProduct.id;
                              let id = sessionStorage.getItem(key);
                              if (!id) {
                                id = crypto.randomUUID();
                                sessionStorage.setItem(key, id);
                              }
                              const result = await request(
                                "/api/social/generate",
                                {
                                  method: "POST",
                                  body: JSON.stringify({
                                    product_id: productId,
                                    request_id: id,
                                  }),
                                },
                              );
                              setDraft(result);
                              sessionStorage.removeItem(key);
                            })
                          }
                        >
                          Generate captions • 1 unit
                        </button>
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            const f = fields(e.currentTarget);
                            void run(() =>
                              cmd("draft", { product_id: productId, ...f }),
                            );
                          }}
                        >
                          <label>
                            Channel
                            <select
                              name="channel"
                              onChange={(e) =>
                                setDraft((current) => ({
                                  ...current,
                                  selected: e.target.value,
                                }))
                              }
                            >
                              <option value="instagram">Instagram</option>
                              <option value="facebook">Facebook</option>
                            </select>
                          </label>
                          <label>
                            Editable caption
                            <textarea
                              key={
                                productId +
                                (draft.selected || "instagram") +
                                (draft[draft.selected || "instagram"] || "")
                              }
                              name="caption"
                              defaultValue={
                                draft[draft.selected || "instagram"] || ""
                              }
                              maxLength={2200}
                              required
                            />
                          </label>
                          <button disabled={busy || role === "reviewer"}>
                            Save draft
                          </button>
                        </form>
                      </>
                    )}
                  </section>
                </>
              )}
              {(tab === "Calendar" || tab === "Create") && (
                <section className="social-panel">
                  <h2>
                    {tab === "Calendar"
                      ? "Unified publishing calendar"
                      : "3. Review and approve"}
                  </h2>
                  <p>
                    Times are shown in your device timezone:{" "}
                    {Intl.DateTimeFormat().resolvedOptions().timeZone}. Stored
                    schedules use UTC.
                  </p>
                  <label>
                    Channel filter
                    <select
                      value={channelFilter}
                      onChange={(e) => setChannelFilter(e.target.value)}
                    >
                      <option value="all">All channels</option>
                      <option value="instagram">Instagram</option>
                      <option value="facebook">Facebook</option>
                    </select>
                  </label>
                  <label>
                    Search posts
                    <input
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Caption or product name"
                    />
                  </label>
                  {tab === "Calendar" && (
                    <SocialCalendar
                      jobs={jobs.filter(
                        (j) =>
                          j.state !== "cancelled" &&
                          (channelFilter === "all" ||
                            variants.find((v) => v.id === j.variant_id)
                              ?.channel === channelFilter),
                      )}
                      labels={Object.fromEntries(
                        variants.map((v) => [
                          v.id,
                          `${v.channel}: ${products.find((p) => p.id === v.product_id)?.name || "Post"}`,
                        ]),
                      )}
                    />
                  )}
                  {variants.length === 0 && (
                    <p>No posts yet. Save a product draft to begin.</p>
                  )}
                  {variants
                    .filter(
                      (v) =>
                        (channelFilter === "all" ||
                          v.channel === channelFilter) &&
                        (
                          v.caption +
                          " " +
                          (products.find((p) => p.id === v.product_id)?.name ||
                            "")
                        )
                          .toLocaleLowerCase()
                          .includes(search.toLocaleLowerCase()),
                    )
                    .map((v) => {
                      const p = products.find((p) => p.id === v.product_id);
                      const deliveries = jobs
                        .filter((j) => j.variant_id === v.id)
                        .sort((a, b) =>
                          a.scheduled_at.localeCompare(b.scheduled_at),
                        );
                      return (
                        <article
                          id={"post-" + v.id}
                          key={v.id}
                          className="social-post"
                        >
                          <div className="social-post-heading">
                            <h3>
                              {p?.name} / {v.channel}
                            </h3>
                            <span className="social-badge">
                              {v.state} • v{v.version}
                            </span>
                          </div>
                          {p && <ImagePreview client={client} product={p} />}
                          <p className="social-caption">{v.caption}</p>
                          <small>
                            Preview uses your original image. Native layout may
                            differ. Approval:{" "}
                            {v.approved_version === v.version
                              ? "current version"
                              : "required"}
                          </small>
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              void run(() =>
                                cmd("edit", {
                                  variant_id: v.id,
                                  version: v.version,
                                  ...fields(e.currentTarget),
                                }),
                              );
                            }}
                          >
                            <label>
                              Edit caption
                              <textarea
                                name="caption"
                                defaultValue={v.caption}
                                key={v.version}
                                required
                                maxLength={2200}
                              />
                            </label>
                            <button disabled={busy || role === "reviewer"}>
                              Save and invalidate approval
                            </button>
                          </form>
                          <section aria-label="Versioned review feedback">
                            <h3>Review history</h3>
                            {local(data.reviews)
                              .filter((r) => r.variant_id === v.id)
                              .map((r) => (
                                <p key={r.id}>
                                  <strong>
                                    {r.kind.replaceAll("_", " ")} · v{r.version}
                                  </strong>{" "}
                                  · {new Date(r.created_at).toLocaleString()}
                                  <br />
                                  {r.message}
                                </p>
                              ))}
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                const values = fields(e.currentTarget);
                                void run(() =>
                                  cmd(String(values.action), {
                                    variant_id: v.id,
                                    version: v.version,
                                    message: values.message,
                                  }),
                                );
                              }}
                            >
                              <label>
                                Feedback
                                <textarea
                                  name="message"
                                  required
                                  maxLength={2000}
                                />
                              </label>
                              <label>
                                Review action
                                <select name="action">
                                  <option value="review_comment">
                                    Add comment
                                  </option>
                                  {role !== "reviewer" && (
                                    <option value="review_request">
                                      Request review
                                    </option>
                                  )}
                                  {role !== "editor" && (
                                    <option value="request_changes">
                                      Request changes and revoke approval
                                    </option>
                                  )}
                                </select>
                              </label>
                              <button disabled={busy}>
                                Save feedback for version {v.version}
                              </button>
                            </form>
                          </section>
                          <div className="social-actions">
                            <button
                              disabled={busy || !p?.object_key}
                              onClick={() =>
                                void run(async () => {
                                  if (!p) return;
                                  const asset = await request(
                                    "/api/social/asset?product_id=" + p.id,
                                  );
                                  const blob = await artwork(
                                    asset.url,
                                    p.name,
                                    v.caption,
                                  );
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement("a");
                                  a.href = url;
                                  a.download = `layout-${v.id}.jpg`;
                                  a.click();
                                  setTimeout(
                                    () => URL.revokeObjectURL(url),
                                    1000,
                                  );
                                })
                              }
                            >
                              Export template JPEG for manual publication
                            </button>
                            <button
                              disabled={
                                busy ||
                                role === "editor" ||
                                v.approved_version === v.version
                              }
                              onClick={() =>
                                void run(() =>
                                  cmd("approve", {
                                    variant_id: v.id,
                                    version: v.version,
                                  }),
                                )
                              }
                            >
                              Approve version {v.version}
                            </button>
                            <button
                              onClick={() =>
                                download(
                                  `post-${v.id}.json`,
                                  JSON.stringify(
                                    {
                                      product: p,
                                      channel: v.channel,
                                      caption: v.caption,
                                      version: v.version,
                                      approval: v.approved_version,
                                      publication:
                                        "Manual export only; not proof of publication",
                                    },
                                    null,
                                    2,
                                  ),
                                  "application/json",
                                )
                              }
                            >
                              Export caption and metadata
                            </button>
                            <button
                              onClick={() => {
                                if (p)
                                  void request(
                                    "/api/social/asset?product_id=" + p.id,
                                  )
                                    .then((r) =>
                                      window.open(
                                        r.url,
                                        "_blank",
                                        "noopener,noreferrer",
                                      ),
                                    )
                                    .catch((e) => setNotice(e.message));
                              }}
                            >
                              Open original for download
                            </button>
                          </div>
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              const date = String(
                                fields(e.currentTarget).scheduled_at,
                              );
                              void run(() =>
                                cmd("schedule", {
                                  variant_id: v.id,
                                  scheduled_at: new Date(date).toISOString(),
                                }),
                              );
                            }}
                          >
                            <label>
                              Schedule or reschedule in device time
                              <input
                                name="scheduled_at"
                                type="datetime-local"
                                required
                              />
                            </label>
                            <button
                              disabled={
                                busy ||
                                role === "reviewer" ||
                                v.approved_version !== v.version
                              }
                            >
                              Schedule
                            </button>
                            <button
                              type="button"
                              disabled={busy || role === "reviewer"}
                              onClick={() =>
                                void run(() =>
                                  cmd("cancel", { variant_id: v.id }),
                                )
                              }
                            >
                              Cancel pending job
                            </button>
                            <button
                              type="button"
                              disabled={busy || role === "reviewer"}
                              onClick={() =>
                                void run(() =>
                                  cmd("retry", { variant_id: v.id }),
                                )
                              }
                            >
                              Retry failed job
                            </button>
                          </form>
                          {deliveries.map((j) => (
                            <p key={j.id}>
                              <strong>
                                {new Date(j.scheduled_at).toLocaleString()} —{" "}
                                {j.state}
                              </strong>
                              {j.error && " · " + j.error}
                              {j.remote_url && (
                                <a
                                  href={j.remote_url}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {" "}
                                  View verified publication
                                </a>
                              )}
                            </p>
                          ))}
                        </article>
                      );
                    })}
                </section>
              )}
              {tab === "Enquiries" && (
                <section className="social-panel">
                  <h2>Customer enquiries</h2>
                  <p>
                    Owner-entered records. No connected inbox or automatic
                    attribution is claimed.
                  </p>
                  <form onSubmit={form("enquiry")}>
                    <label>
                      Name
                      <input name="name" required maxLength={200} />
                    </label>
                    <label>
                      Contact
                      <input name="contact" maxLength={200} />
                    </label>
                    <label>
                      Source post
                      <select name="variant_id">
                        <option value="">Unknown source</option>
                        {variants.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.channel}: {v.caption.slice(0, 45)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Follow-up date
                      <input name="follow_up" type="date" />
                    </label>
                    <button disabled={busy || role === "reviewer"}>
                      Record enquiry
                    </button>
                  </form>
                  {enquiries.map((e) => (
                    <article key={e.id}>
                      <h3>{e.name}</h3>
                      <p>
                        {e.contact} • {e.source}
                      </p>
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          void run(() =>
                            cmd("enquiry_stage", {
                              id: e.id,
                              ...fields(event.currentTarget),
                            }),
                          );
                        }}
                      >
                        <label>
                          Stage
                          <select name="stage" defaultValue={e.stage}>
                            {["new", "qualified", "booked", "won", "lost"].map(
                              (s) => (
                                <option key={s}>{s}</option>
                              ),
                            )}
                          </select>
                        </label>
                        <label>
                          Follow-up
                          <input
                            name="follow_up"
                            type="date"
                            defaultValue={e.follow_up || ""}
                          />
                        </label>
                        <button disabled={busy || role === "reviewer"}>
                          Update
                        </button>
                      </form>
                      {role === "owner" && (
                        <button
                          disabled={busy}
                          onClick={() => {
                            if (
                              window.confirm(
                                "Permanently delete this enquiry and contact details?",
                              )
                            )
                              void run(() =>
                                cmd("delete_enquiry", { id: e.id }),
                              );
                          }}
                        >
                          Delete enquiry
                        </button>
                      )}
                    </article>
                  ))}
                </section>
              )}
              {tab === "Results" && (
                <>
                  <section className="social-panel">
                    <h2>Results with evidence</h2>
                    <p>{data.capabilities?.metrics}</p>
                    <p>
                      {jobs.filter((j) => j.state === "published").length}{" "}
                      confirmed publications. {enquiries.length} owner-entered
                      enquiries. No causal sales attribution is claimed.
                    </p>
                    {metrics.length === 0 ? (
                      <p>
                        Reach, impressions and engagement: unavailable. Missing
                        data is not zero.
                      </p>
                    ) : (
                      metrics.map((m) => (
                        <p key={m.id}>
                          {m.metric}: {m.value ?? "Unavailable"} •{" "}
                          {m.definition} • {m.observed_at}
                        </p>
                      ))
                    )}
                    <button
                      onClick={() =>
                        download("enquiries.csv", csv(enquiries), "text/csv")
                      }
                    >
                      Export enquiries CSV
                    </button>
                    <button
                      onClick={() =>
                        download("delivery.csv", csv(jobs), "text/csv")
                      }
                    >
                      Export delivery CSV
                    </button>
                    <button
                      onClick={() =>
                        download("metrics.csv", csv(metrics), "text/csv")
                      }
                    >
                      Export metrics CSV
                    </button>
                  </section>
                  <section className="social-panel">
                    <h2>Generation ledger</h2>
                    <p>
                      {w.allowance} app units remaining. One generation reserves
                      one unit. Uncertain requests remain reserved until
                      reconciled by an operator.
                    </p>
                    {usage.map((u) => (
                      <p key={u.id}>
                        {new Date(u.created_at).toLocaleString()} • {u.units}{" "}
                        unit • {u.state} • request {u.id}
                      </p>
                    ))}
                  </section>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
