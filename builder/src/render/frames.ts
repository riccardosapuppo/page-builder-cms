// The players and the map a page may frame, by origin: the renderers build
// their addresses (./policy.ts, the twin of the CMS's RenderPolicy), and the
// editor's build lets its own page frame these and no other
// (../../build/csp.ts). A module of its own, with nothing to import, so the
// build's code in Node reads the same list.
export const VIDEO_ORIGINS = {
  youtube: "https://www.youtube-nocookie.com",
  vimeo: "https://player.vimeo.com",
} as const;

export const MAP_ORIGIN = "https://www.openstreetmap.org";

// Every origin a page may frame.
export const FRAME_ORIGINS: readonly string[] = [...Object.values(VIDEO_ORIGINS), MAP_ORIGIN];
