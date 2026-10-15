// The pricing block's Plans group: its plans in order, each its name, its
// price and what the price is for, its text, its features (one field, a
// feature a line), its button's words and link (the button block's own
// fields, ../button/panel.tsx), whether it is featured and, while it is,
// its badge; moved up or down or removed with the block's own item
// commands, and new ones added at the end, from one plan to four. The
// page shows them in this order.
import { refusal } from "../../document/check.ts";
import type { Json } from "../../document/json.ts";
import { ServerErrors, TextField, Toggle } from "../../editor/controls.tsx";
import { Icon } from "../../editor/icons.tsx";
import { useBlockCommands } from "../../editor/panels/hooks.ts";
import type { ContentProps, WidgetPanel } from "../../editor/panels/types.ts";
import { ButtonFields } from "../button/panel.tsx";
import { newPlan } from "./definition.ts";

// The schema's most plans in one block, most features in one plan, and
// longest feature.
const MAX_PLANS = 4;
const MAX_FEATURES = 12;
const FEATURE_LENGTH = 120;

// A field that may be left empty takes blank text as empty: spaces alone
// are nothing to show.
const orEmpty = (text: string): string => (text.trim() === "" ? "" : text);

// The features the Features field holds, a feature a line: each line's
// spaces at its ends cut, and the blank lines left out.
function featuresOf(text: string): string[] {
  return text.split(/\r\n?|\n/).map((line) => line.trim()).filter((line) => line !== "");
}

function PlansContent({ block }: ContentProps<"pricing">) {
  const commands = useBlockCommands(block.id);
  const plans = block.props.plans;
  return (
    <div className="field">
      <ol className="items">
        {plans.map((plan, index) => {
          const n = index + 1;
          const at = `/props/plans/${index}`;
          return (
            <li className="item" key={index}>
              <div className="item-head">
                <span>Plan {n}</span>
                <span className="item-tools">
                  <button className="ibtn ibtn-small" type="button" aria-label={`Move plan ${n} up`} title="Move up" disabled={index === 0} onClick={() => commands.moveItem(index, index - 1)}><Icon name="arrow-up" className="i i-xs" /></button>
                  <button className="ibtn ibtn-small" type="button" aria-label={`Move plan ${n} down`} title="Move down" disabled={index === plans.length - 1} onClick={() => commands.moveItem(index, index + 1)}><Icon name="arrow-down" className="i i-xs" /></button>
                  <button className="ibtn ibtn-small" type="button" aria-label={`Remove plan ${n}`} title="Remove" disabled={plans.length === 1} onClick={() => commands.removeItem(index)}><Icon name="trash" className="i i-xs" /></button>
                </span>
              </div>
              <TextField
                label={`Name ${n}`}
                value={plan.name}
                blockId={block.id}
                field={`${at}/name`}
                rules={{ kind: "line", maxLength: 80 }}
                onCommit={(name) => commands.setItem(index, { name })}
              />
              <TextField
                label={`Price ${n}`}
                value={plan.price}
                blockId={block.id}
                field={`${at}/price`}
                rules={{ kind: "line", maxLength: 24 }}
                onCommit={(price) => commands.setItem(index, { price })}
              />
              <TextField
                label={`Period ${n}`}
                value={plan.period}
                blockId={block.id}
                field={`${at}/period`}
                rules={{ kind: "lineOrEmpty", maxLength: 40 }}
                hint="What the price is for (a month), or nothing."
                onCommit={(period) => commands.setItem(index, { period: orEmpty(period) })}
              />
              <TextField
                label={`Text ${n}`}
                multiline
                rows={2}
                value={plan.text}
                blockId={block.id}
                field={`${at}/text`}
                rules={{ kind: "paragraphOrEmpty", maxLength: 400 }}
                onCommit={(text) => commands.setItem(index, { text: orEmpty(text) })}
              />
              <TextField
                label={`Features ${n}`}
                multiline
                rows={4}
                value={plan.features.join("\n")}
                blockId={block.id}
                field={`${at}/features`}
                rules={{ kind: "line", maxLength: FEATURE_LENGTH }}
                hint={`One a line, ${MAX_FEATURES} at most.`}
                onCommit={(text) => {
                  const features = featuresOf(text);
                  if (features.length > MAX_FEATURES) return refusal("invalid", `Up to ${MAX_FEATURES} features, one a line.`);
                  if (features.some((feature) => [...feature].length > FEATURE_LENGTH)) return refusal("invalid", `Up to ${FEATURE_LENGTH} characters on each line.`);
                  return commands.setItem(index, { features });
                }}
              />
              {/* The server's word on one feature, under the field that holds them all. */}
              <ServerErrors blockId={block.id} fields={Array.from({ length: MAX_FEATURES }, (_, k) => `${at}/features/${k}`)} rules={{ kind: "line", maxLength: FEATURE_LENGTH }} />
              <ButtonFields
                blockId={block.id}
                at={`${at}/button`}
                label={plan.button.label}
                href={plan.button.href}
                names={{ label: `Button text ${n}`, href: `Button link ${n}` }}
                onLabel={(label) => commands.setItem(index, { button: { ...plan.button, label } })}
                onHref={(href) => commands.setItem(index, { button: { ...plan.button, href } })}
              />
              <div className="field">
                <Toggle
                  label={`Featured ${n}`}
                  checked={plan.featured}
                  blockId={block.id}
                  field={`${at}/featured`}
                  onChange={(featured) => commands.setItem(index, { featured })}
                />
              </div>
              {plan.featured && (
                <TextField
                  label={`Badge ${n}`}
                  value={plan.badge}
                  blockId={block.id}
                  field={`${at}/badge`}
                  rules={{ kind: "lineOrEmpty", maxLength: 30 }}
                  hint="On the plan's top edge, or nothing."
                  onCommit={(badge) => commands.setItem(index, { badge: orEmpty(badge) })}
                />
              )}
            </li>
          );
        })}
      </ol>
      <ServerErrors blockId={block.id} fields={["/props/plans"]} />
      {plans.length < MAX_PLANS && (
        <button
          className="btn btn-secondary btn-block"
          type="button"
          style={{ marginTop: 10 }}
          onClick={() => commands.insertItems(plans.length, [newPlan() as unknown as Json])}
        >
          <Icon name="plus" />Add a plan
        </button>
      )}
    </div>
  );
}

export const panel: WidgetPanel<"pricing"> = { content: { name: "Plans", Content: PlansContent } };
