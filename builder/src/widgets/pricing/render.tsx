// Plans side by side, each a card of its name, its price and what the price
// is for, a short text, what it includes and a button: the twin of
// cms/app/views/blocks/_pricing.html.erb. One list, each plan an item: a
// featured plan's badge first, when it has one, then its name, a heading
// of level 3; its price, with its period beside it when it has one; its
// text with its line breaks, when it has one; its features, a list of
// their own, when it has any; and its button, the link a button block
// draws (../button/render.tsx), an address the URL policy refuses leaving
// a label that links nowhere. The colour is the featured plan's ring and
// its badge's fill, kept as an accordion keeps the colour of its lines, so
// the plans' words keep the band's. A plan that is not an object is left
// out, as is a feature that is not text; features that are not a list are
// none, and a button that is not an object draws no button.
import { isObject } from "../../document/json.ts";
import { BlockRoot, blockProps, blockStyle, propText } from "../../render/block-root.tsx";
import type { BlockRenderProps } from "../../render/context.ts";
import { TextWithBreaks } from "../../render/drawings.tsx";
import { linkHref } from "../../render/policy.ts";
import { freeColorData, styleClasses, visibilityClasses } from "../../render/style.ts";

function Plan({ plan }: { plan: Record<string, unknown> }) {
  const featured = plan.featured === true;
  const badge = propText(plan, "badge");
  const period = propText(plan, "period");
  const text = propText(plan, "text");
  const features = Array.isArray(plan.features) ? plan.features.filter((feature: unknown): feature is string => typeof feature === "string") : [];
  const button = isObject(plan.button) ? plan.button : null;
  return (
    <li className="sw-plan" data-featured={featured ? "true" : undefined}>
      {featured && badge !== "" && <p className="sw-plan-badge">{badge}</p>}
      <h3>{propText(plan, "name")}</h3>
      <p className="sw-plan-price"><strong>{propText(plan, "price")}</strong>{period !== "" && <>{" "}<span>{period}</span></>}</p>
      {text !== "" && <p><TextWithBreaks text={text} /></p>}
      {features.length > 0 && <ul className="sw-plan-features">{features.map((feature, index) => <li key={index}>{feature}</li>)}</ul>}
      {button !== null && (
        <div className="sw-plan-action">
          <a className="sw-btn" href={linkHref(button.href) ?? undefined}>{propText(button, "label")}</a>
        </div>
      )}
    </li>
  );
}

export function PricingRender({ block, decoration }: BlockRenderProps) {
  const style = blockStyle(block);
  const raw = blockProps(block).plans;
  const plans = Array.isArray(raw) ? raw.filter((plan: unknown) => isObject(plan)) : [];
  return (
    <BlockRoot
      block={block}
      classes={["w", "w-pricing", "sw-pricing", styleClasses(style, "color", { family: "line" }), visibilityClasses(style)]}
      data={freeColorData(style, "color", { family: "line" })}
      decoration={decoration}
    >
      <ul>
        {plans.map((plan, index) => <Plan key={index} plan={plan} />)}
      </ul>
    </BlockRoot>
  );
}
