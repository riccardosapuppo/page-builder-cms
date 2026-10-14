// Advanced, the last group of every block's panel: the block's CSS
// classes of the site's own, which the site's custom CSS (Site style,
// Custom CSS) styles it by, and its anchor, the name a link scrolls to it
// by. A section's anchor stays in Name and link, beside its label.
import { REMOVE } from "../../document/commands.ts";
import type { Block } from "../../shared/document.ts";
import { PART_ANCHOR } from "../../shared/validate.ts";
import { TextField } from "../controls.tsx";
import { useOpenKind } from "../session.tsx";
import { useBlockCommands } from "./hooks.ts";

// What Advanced says closed: ".hero .big, #prices", "No class or anchor".
export function advancedWords(block: Block): string {
  const classes = block.props.className ? block.props.className.split(" ").map((name) => `.${name}`).join(" ") : null;
  const anchor = block.type !== "section" && block.props.anchor ? `#${block.props.anchor}` : null;
  const words = [classes, anchor].filter((part) => part !== null).join(", ");
  return words || (block.type === "section" ? "No class" : "No class or anchor");
}

// The class names as a person types them, the way the page keeps them:
// separated by spaces or commas, a dot before one left out (".hero, big"
// is "hero big"). The schema and the rules say which names are taken.
export function classNamesOf(text: string): string {
  return text.split(/[\s,]+/).map((name) => name.replace(/^\.+/, "")).filter((name) => name !== "").join(" ");
}

// A link's anchor as a person types it: "#Join" is "Join", which the
// field refuses with the rule's words; nothing is no anchor.
export function anchorOf(text: string): string {
  return text.trim().replace(/^#/, "");
}

export function BlockAdvanced({ block }: { block: Block }) {
  const commands = useBlockCommands(block.id);
  // A header's or footer's block takes no anchor (PART_ANCHOR): the field
  // is there only to clear one a part was given elsewhere.
  const part = useOpenKind() !== "page";
  const anchor = block.props.anchor;
  return (
    <>
      <TextField
        label="CSS classes"
        value={block.props.className ?? ""}
        blockId={block.id}
        field="/props/className"
        rules={{ kind: "classes" }}
        hint="Names the site's custom CSS styles this block by, such as hero. Separate two with a space."
        onCommit={(text) => {
          const names = classNamesOf(text);
          return commands.setProps({ className: names === "" ? REMOVE : names });
        }}
      />
      {block.type !== "section" && (!part || anchor !== undefined) && (
        <TextField
          label="Anchor id"
          icon="anchor"
          value={anchor ?? ""}
          blockId={block.id}
          field="/props/anchor"
          rules={{ kind: "anchor" }}
          hint={part ? `${PART_ANCHOR} Clear it.` : anchor ? `Links to #${anchor} scroll to this block.` : "A name for links to this block, such as #prices."}
          onCommit={(text) => {
            const name = anchorOf(text);
            return commands.setProps({ anchor: name === "" ? REMOVE : name });
          }}
        />
      )}
    </>
  );
}
