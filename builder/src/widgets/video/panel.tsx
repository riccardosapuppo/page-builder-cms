// The video's Video group: which video, from the address of its page or
// its id, and its title. The page keeps the provider and the id only
// (../../editor/pickers.tsx, parseVideo); the renderers build the player's
// address, and the page asks the provider only when a visitor clicks.
import { ServerErrors, TextField } from "../../editor/controls.tsx";
import { useBlockCommands } from "../../editor/panels/hooks.ts";
import type { ContentProps, WidgetPanel } from "../../editor/panels/types.ts";
import { parseVideo, VIDEO_HINT } from "../../editor/pickers.tsx";

function VideoContent({ block }: ContentProps<"video">) {
  const commands = useBlockCommands(block.id);
  return (
    <>
      <TextField
        label="Video address or id"
        value={block.props.videoId}
        blockId={block.id}
        field="/props/videoId"
        rules={{ kind: "other", maxLength: 32 }}
        hint={VIDEO_HINT}
        onCommit={(text) => {
          const video = parseVideo(text, block.props.provider);
          if (!video) return { reason: "invalid", message: "That is not the address of a video, or a video id, that the page can show." };
          return commands.setProps({ provider: video.provider, videoId: video.videoId });
        }}
      />
      <ServerErrors blockId={block.id} fields={["/props/provider"]} />
      <TextField
        label="Title"
        value={block.props.title}
        blockId={block.id}
        field="/props/title"
        rules={{ kind: "line", maxLength: 120 }}
        hint="Names the player for screen readers, and captions its card on the page."
        onCommit={(title) => commands.setProps({ title })}
      />
    </>
  );
}

export const panel: WidgetPanel<"video"> = { content: { name: "Video", Content: VideoContent } };
