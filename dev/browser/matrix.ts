export const ENGINES = ["chromium", "firefox", "webkit"] as const;
export type Engine = (typeof ENGINES)[number];
