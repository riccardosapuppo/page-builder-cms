// The button's Button group: what it says and where it goes. Its colours
// and alignment are the Colors and Alignment groups'.
import type { CommandError } from "../../document/check.ts";
import { TextField } from "../../editor/controls.tsx";
import { useBlockCommands } from "../../editor/panels/hooks.ts";
import { usePageLinks } from "../../editor/session.tsx";
import type { ContentProps, WidgetPanel } from "../../editor/panels/types.ts";

interface ButtonFieldsProps {
  blockId: string;
  // Where the button's two keys are in the block: "/props" for a button
  // block, a plan's "/props/plans/1/button".
  at: string;
  label: string;
  href: string;
  // The two fields' names.
  names: { label: string; href: string };
  onLabel: (label: string) => CommandError | null;
  // Handed the link trimmed: a link's spaces at its ends are never kept.
  onHref: (href: string) => CommandError | null;
}

// A button's words and its link: the button block's own, and a pricing
// plan's button (../pricing/panel.tsx), with the same rules and the same
// help, so the two are written alike.
export function ButtonFields({ blockId, at, label, href, names, onLabel, onHref }: ButtonFieldsProps) {
  const pages = usePageLinks();
  return (
    <>
      <TextField
        label={names.label}
        value={label}
        blockId={blockId}
        field={`${at}/label`}
        rules={{ kind: "line", maxLength: 80 }}
        onCommit={onLabel}
      />
      <TextField
        label={names.href}
        icon="link"
        value={href}
        placeholder="Paste a link or choose a page"
        suggestions={pages}
        blockId={blockId}
        field={`${at}/href`}
        rules={{ kind: "href", maxLength: 2048 }}
        hint="A full address (https://…), a page of this site (/join), a section of this page (#join), mailto: or tel:."
        onCommit={(text) => onHref(text.trim())}
      />
    </>
  );
}

function ButtonContent({ block }: ContentProps<"button">) {
  const commands = useBlockCommands(block.id);
  return (
    <ButtonFields
      blockId={block.id}
      at="/props"
      label={block.props.label}
      href={block.props.href}
      names={{ label: "Text", href: "Link" }}
      onLabel={(label) => commands.setProps({ label })}
      onHref={(href) => commands.setProps({ href })}
    />
  );
}

export const panel: WidgetPanel<"button"> = { content: { name: "Button", Content: ButtonContent } };
