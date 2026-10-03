// The media library's work (./service.ts) for the interface, given by the
// shell on its storage adapter. A panel drawn without it, in a test of its
// own, has a library to choose from and nothing more: no upload, no alt
// text kept, no delete, and no control drawn for them.
import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import { useEnv } from "../context.tsx";
import type { Prepare } from "./resize.ts";
import { createMediaService, type MediaAdapter, type MediaService, type UploadEntry } from "./service.ts";

const MediaContext = createContext<MediaService | null>(null);

export function MediaProvider({ adapter, prepare, children }: { adapter: MediaAdapter; prepare?: Prepare; children: ReactNode }) {
  const { ui } = useEnv();
  const service = useMemo(() => createMediaService({ adapter, ui, ...(prepare ? { prepare } : {}) }), [adapter, prepare, ui]);
  // Closing the tab while an image is on its way asks first.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (service.busy()) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [service]);
  return <MediaContext.Provider value={service}>{children}</MediaContext.Provider>;
}

// A service a test makes for itself, given the same way.
export const MediaServiceProvider = MediaContext.Provider;

export function useMediaService(): MediaService | null {
  return useContext(MediaContext);
}

const NONE = createStore<{ entries: readonly UploadEntry[] }>()(() => ({ entries: [] }));

export function useUploads(service: MediaService | null): readonly UploadEntry[] {
  return useStore(service?.uploads ?? NONE, (state) => state.entries);
}
