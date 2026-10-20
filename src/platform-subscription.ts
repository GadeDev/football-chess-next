/** Recheck the shared subscription using the platform credential for this session. */
export async function readPlatformSubscription(env: Env, token: string, externalId: string) {
  const inactive = { active: false, plan: null, until: null, demo: false };
  if (!token || !externalId.startsWith("uf:") || !env.PLATFORM_API) return inactive;
  const headers = { authorization: `Bearer ${token}` };
  const origin = env.PLATFORM_API_ORIGIN;
  try {
    const me = await env.PLATFORM_API.fetch(`${origin}/v1/users/me`, { headers });
    if (!me.ok) return inactive;
    const identity = await me.json() as { user_id?: string; state?: string };
    if (`uf:${identity.user_id}` !== externalId || identity.state !== "active") return inactive;
    let page = "";
    let until: string | null = null;
    let active = false;
    do {
      const res = await env.PLATFORM_API.fetch(`${origin}/v1/entitlements?state=active&tag=uf_subscription${page ? `&page_token=${encodeURIComponent(page)}` : ""}`, { headers });
      if (!res.ok) return inactive;
      const data = await res.json() as { items?: Array<{kind: string; game_id?: string | null; state: string; start_at?: string; end_at?: string}>; next_page_token?: string };
      for (const item of data.items ?? []) {
        if (item.kind !== "subscription" || item.game_id != null || item.state !== "active") continue;
        if (item.start_at && !(Date.parse(item.start_at) <= Date.now())) continue;
        if (item.end_at && !(Date.parse(item.end_at) > Date.now())) continue;
        if (!item.end_at) return { active: true, plan: "universofutbol", until: null, demo: false };
        active = true;
        if (!until || Date.parse(item.end_at) > Date.parse(until)) until = item.end_at;
      }
      page = data.next_page_token ?? "";
    } while (page);
    return { active, plan: active ? "universofutbol" : null, until, demo: false };
  } catch { return inactive; }
}
