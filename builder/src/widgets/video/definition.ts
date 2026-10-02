import { TYPE_NAMES } from "../../document/labels.ts";
import type { WidgetDefinition } from "../types.ts";
import { icon } from "./icon.ts";
import { VideoRender } from "./render.tsx";

// Added with the video it shows, the provider and its id: an id made up
// here would point at somebody's video.
export const video: WidgetDefinition<"video"> = {
  type: "video",
  group: "media",
  label: TYPE_NAMES.video,
  icon,
  needs: "video",
  props: ({ provider, videoId }) => ({ provider, videoId, title: "Video" }),
  render: VideoRender,
  traps: ["m-video-youtube", "m-video-vimeo", "m-video-unknown-provider", "m-video-bad-id", "e-video-vimeo-long-id"],
};
