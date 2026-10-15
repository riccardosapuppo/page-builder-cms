import { TYPE_NAMES } from "../../document/labels.ts";
import type { PricingButton, PricingPlan } from "../../shared/document.ts";
import { button } from "../button/definition.ts";
import type { WidgetDefinition } from "../types.ts";
import { icon } from "./icon.ts";
import { PricingRender } from "./render.tsx";

// A plan's button as a new button block has it: its words, and "#", the
// top of the page, until the author gives it an address.
function newPlanButton(label?: string): PricingButton {
  const { label: own, href } = button.props();
  return { label: label ?? own, href };
}

// A plan the Plans group adds: named, priced, the rest empty, its button a
// new button block's.
export function newPlan(): PricingPlan {
  return { name: "A plan", price: "€0", period: "", text: "", features: [], button: newPlanButton(), featured: false, badge: "" };
}

export const pricing: WidgetDefinition<"pricing"> = {
  type: "pricing",
  group: "content",
  label: TYPE_NAMES.pricing,
  icon,
  needs: null,
  // Three plans a month each, generic, the middle one featured: a block
  // that reads as it comes, to be written over. Their buttons go where a
  // new button block's goes.
  props: () => ({
    plans: [
      {
        name: "Basic", price: "€9", period: "a month", text: "What most people need to start.",
        features: ["The thing that matters most", "Another one", "Help by email"],
        button: newPlanButton("Choose Basic"), featured: false, badge: "",
      },
      {
        name: "Plus", price: "€19", period: "a month", text: "For those who use it every day.",
        features: ["Everything in Basic", "One more thing that matters", "Help the same day"],
        button: newPlanButton("Choose Plus"), featured: true, badge: "Most chosen",
      },
      {
        name: "Team", price: "€49", period: "a month", text: "For a group working together.",
        features: ["Everything in Plus", "Up to ten people", "A call to set it up"],
        button: newPlanButton("Choose Team"), featured: false, badge: "",
      },
    ],
  }),
  render: PricingRender,
  traps: ["t-pricing", "t-pricing-links", "t-pricing-no-list", "s-pricing-styled", "s-pricing-unlisted", "e-pricing-one"],
};
