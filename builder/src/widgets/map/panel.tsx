// The map's Map group: the place's label and its point, latitude,
// longitude and zoom, as numbers. The page draws its own card and asks the
// provider for the map only when a visitor clicks Load map.
import { NumberField, TextField } from "../../editor/controls.tsx";
import { useBlockCommands } from "../../editor/panels/hooks.ts";
import type { ContentProps, WidgetPanel } from "../../editor/panels/types.ts";

function MapContent({ block }: ContentProps<"map">) {
  const commands = useBlockCommands(block.id);
  return (
    <>
      <TextField
        label="Label"
        value={block.props.label}
        blockId={block.id}
        field="/props/label"
        rules={{ kind: "line", maxLength: 120 }}
        hint="Shown on the map’s card, and names the map for screen readers."
        onCommit={(label) => commands.setProps({ label })}
      />
      <NumberField
        label="Latitude"
        value={block.props.latitude}
        blockId={block.id}
        field="/props/latitude"
        rules={{ minimum: -90, maximum: 90 }}
        hint="From -90 (south) to 90 (north)."
        onCommit={(latitude) => commands.setProps({ latitude })}
      />
      <NumberField
        label="Longitude"
        value={block.props.longitude}
        blockId={block.id}
        field="/props/longitude"
        rules={{ minimum: -180, maximum: 180 }}
        hint="From -180 (west) to 180 (east)."
        onCommit={(longitude) => commands.setProps({ longitude })}
      />
      <NumberField
        label="Zoom"
        integer
        value={block.props.zoom}
        blockId={block.id}
        field="/props/zoom"
        rules={{ minimum: 1, maximum: 19 }}
        hint="From 1 (the whole world) to 19 (a street)."
        onCommit={(zoom) => commands.setProps({ zoom })}
      />
    </>
  );
}

export const panel: WidgetPanel<"map"> = { content: { name: "Map", Content: MapContent } };
