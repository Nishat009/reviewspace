/** Route builders, so deep links (emails, notifications) stay in one place. */
export const paths = {
  dashboard: (slug: string) => `/w/${slug}`,
  projects: (slug: string) => `/w/${slug}/projects`,
  project: (slug: string, projectId: string, tab?: "assets" | "people" | "activity" | "settings") =>
    `/w/${slug}/projects/${projectId}${tab && tab !== "assets" ? `?tab=${tab}` : ""}`,
  asset: (slug: string, projectId: string, assetId: string, opts: { version?: string; thread?: string } = {}) => {
    const params = new URLSearchParams();
    if (opts.version) params.set("version", opts.version);
    if (opts.thread) params.set("thread", opts.thread);
    const query = params.toString();
    return `/w/${slug}/projects/${projectId}/assets/${assetId}${query ? `?${query}` : ""}`;
  },
  compare: (slug: string, projectId: string, assetId: string, a?: string, b?: string) => {
    const params = new URLSearchParams();
    if (a) params.set("a", a);
    if (b) params.set("b", b);
    const query = params.toString();
    return `/w/${slug}/projects/${projectId}/assets/${assetId}/compare${query ? `?${query}` : ""}`;
  },
  members: (slug: string) => `/w/${slug}/members`,
  settings: (slug: string) => `/w/${slug}/settings`,
  notifications: (slug: string) => `/w/${slug}/notifications`,
  account: () => `/account`,
  invite: (token: string) => `/invite/${token}`,
  share: (token: string, opts: { asset?: string; version?: string; thread?: string } = {}) => {
    const params = new URLSearchParams();
    if (opts.asset) params.set("asset", opts.asset);
    if (opts.version) params.set("version", opts.version);
    if (opts.thread) params.set("thread", opts.thread);
    const query = params.toString();
    return `/s/${token}${query ? `?${query}` : ""}`;
  },
};
