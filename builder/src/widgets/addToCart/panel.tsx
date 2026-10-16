// Add to cart's Button group: its button's words, and whether it asks how
// many; then what it draws, by the shop's settings and the template's
// collection. Its colours and where it stands are the Colors and
// Alignment groups', a button's.
import { useTemplateCollection } from "../../editor/collections/use-content.ts";
import { useUi } from "../../editor/context.tsx";
import { TextField, Toggle } from "../../editor/controls.tsx";
import { useBlockCommands } from "../../editor/panels/hooks.ts";
import type { ContentProps, WidgetPanel } from "../../editor/panels/types.ts";
import { useOptionalSession } from "../../editor/session.tsx";
import { IN_STOCK_KEY, MOST_QUANTITY, type ShopSettings } from "../../shared/shop.ts";
import type { Collection } from "../../storage/adapter.ts";

// What the block draws, in a sentence, where the canvas cannot show it
// all: on the site, for this template's entries.
export function cartNote(keeps: boolean, shop: ShopSettings | null, collection: Pick<Collection, "id" | "name" | "fields"> | null): string {
  if (!keeps) return "This storage keeps no shop: the block draws nothing.";
  if (shop === null) return "";
  if (!shop.enabled) return "The shop is off: the block draws nothing until it is on, in Shop, from the menu of the mark at the top left.";
  if (collection === null || shop.productsCollectionId !== collection.id) {
    return `The shop sells from another collection: on ${collection === null ? "this template's entries" : `the entries of ${collection.name}`} the block draws nothing.`;
  }
  const stocked = collection.fields.some((field) => field.key === IN_STOCK_KEY && field.type === "toggle");
  return `It puts the entry in a visitor's cart, at the price it published.${stocked ? " Out of stock, or with no price, it says so where its button goes." : " With no price, it says so where its button goes."}`;
}

function CartContent({ block }: ContentProps<"addToCart">) {
  const commands = useBlockCommands(block.id);
  const keeps = useOptionalSession()?.capabilities.shop ?? false;
  const shop = useUi((u) => u.siteShop);
  const shown = useTemplateCollection();
  const note = cartNote(keeps, shop, shown?.collection ?? null);
  return (
    <>
      <TextField
        label="Button text"
        value={block.props.label}
        blockId={block.id}
        field="/props/label"
        rules={{ kind: "line", maxLength: 80 }}
        onCommit={(label) => commands.setProps({ label })}
      />
      <div className="field">
        <Toggle label="Ask how many" checked={block.props.quantity} blockId={block.id} field="/props/quantity" onChange={(quantity) => commands.setProps({ quantity })} />
        <p className="hint">{block.props.quantity ? `A quantity from 1 to ${MOST_QUANTITY} beside the button.` : "The button puts one in the cart."}</p>
      </div>
      {note !== "" && <p className="hint">{note}</p>}
    </>
  );
}

export const panel: WidgetPanel<"addToCart"> = { content: { name: "Button", Content: CartContent } };
