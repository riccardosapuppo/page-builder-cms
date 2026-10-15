// The pricing block's panel: each plan's name, price, period, text,
// features, button and whether it is featured, with its badge while it
// is, change the page by the block's item commands, one plan at least and
// four at most; the features are one field, a feature a line, refused on
// that field past twelve or past 120 characters a line; the button's text
// and link are the button block's own fields, a link the page refuses
// refused on its field; and the server's 422 shows on the field it names.
// @vitest-environment jsdom
import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { describedText, editorKit, widgetPage } from "../../../test/editor-kit.tsx";
import { BlockPanel } from "../../editor/panels/EditPanel.tsx";
import type { PricingPlan } from "../../shared/document.ts";

const plans = (kit: ReturnType<typeof editorKit>) => (kit.block("pricing")!.props as { plans: PricingPlan[] }).plans;
const button = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;
const write = (label: string, value: string) => {
  const field = screen.getByLabelText(label);
  fireEvent.change(field, { target: { value } });
  fireEvent.blur(field);
  return field;
};

test("each of a plan's fields changes that plan, one command each", () => {
  const kit = editorKit({ document: widgetPage(), selection: "pricing" });
  kit.render(<BlockPanel id="pricing" />);

  write("Name 1", "Starter");
  expect(kit.lastCommand()).toMatchObject({ kind: "items", label: "Changed plan 1 in Pricing in Widgets" });
  write("Price 1", "€12");
  write("Period 1", "a year");
  write("Text 1", "For one person.\nAll year round.");
  // A feature a line: each line's spaces cut, blank lines left out.
  write("Features 1", "  Every swim  \n\nA locker\n   \nHelp by email");
  expect(plans(kit)[0]).toMatchObject({
    name: "Starter", price: "€12", period: "a year", text: "For one person.\nAll year round.",
    features: ["Every swim", "A locker", "Help by email"],
  });
  expect(kit.lastCommand()?.label).toBe("Changed plan 1 in Pricing in Widgets");

  // The button's words and its link, the link trimmed as a button block's.
  write("Button text 3", "Write to us");
  write("Button link 3", " /join?plan=team ");
  expect(plans(kit)[2]!.button).toEqual({ label: "Write to us", href: "/join?plan=team" });
  expect(kit.lastCommand()?.label).toBe("Changed plan 3 in Pricing in Widgets");

  // Left empty, the period and the text are empty, blank or not.
  write("Period 2", "   ");
  write("Text 2", " \n ");
  expect(plans(kit)[1]).toMatchObject({ period: "", text: "" });
});

test("a plan is featured by its switch, its badge shown while it is", () => {
  const kit = editorKit({ document: widgetPage(), selection: "pricing" });
  kit.render(<BlockPanel id="pricing" />);
  // The new block's second plan is the featured one.
  expect(screen.queryByLabelText("Badge 1")).toBeNull();
  expect((screen.getByLabelText("Badge 2") as HTMLInputElement).value).toBe("Most chosen");

  fireEvent.click(screen.getByRole("switch", { name: "Featured 1" }));
  expect(plans(kit)[0]!.featured).toBe(true);
  expect(kit.lastCommand()).toMatchObject({ kind: "items", label: "Changed plan 1 in Pricing in Widgets" });
  write("Badge 1", "New");
  expect(plans(kit)[0]).toMatchObject({ featured: true, badge: "New" });

  fireEvent.click(screen.getByRole("switch", { name: "Featured 2" }));
  expect(plans(kit)[1]).toMatchObject({ featured: false, badge: "Most chosen" });
  expect(screen.queryByLabelText("Badge 2")).toBeNull();
});

test("plans are added, moved and removed one at a time, one at least and four at most", () => {
  const kit = editorKit({ document: widgetPage(), selection: "pricing" });
  kit.render(<BlockPanel id="pricing" />);

  fireEvent.click(button("Add a plan"));
  expect(plans(kit)[3]).toEqual({ name: "A plan", price: "€0", period: "", text: "", features: [], button: { label: "Button", href: "#" }, featured: false, badge: "" });
  expect(kit.lastCommand()?.label).toBe("Added a plan to Pricing in Widgets");
  // Four is the most: the panel offers no fifth.
  expect(screen.queryByRole("button", { name: "Add a plan" })).toBeNull();

  fireEvent.click(button("Move plan 4 up"));
  expect(plans(kit).map((plan) => plan.name)).toEqual(["Basic", "Plus", "A plan", "Team"]);
  expect(kit.lastCommand()?.label).toBe("Moved plan 4 in Pricing in Widgets");

  fireEvent.click(button("Remove plan 2"));
  expect(plans(kit).map((plan) => plan.name)).toEqual(["Basic", "A plan", "Team"]);
  expect(kit.lastCommand()?.label).toBe("Removed plan 2 from Pricing in Widgets");

  fireEvent.click(button("Remove plan 3"));
  fireEvent.click(button("Remove plan 2"));
  expect(plans(kit).map((plan) => plan.name)).toEqual(["Basic"]);
  // The last one cannot go, nor move anywhere.
  expect(button("Remove plan 1").disabled).toBe(true);
  expect(button("Move plan 1 up").disabled).toBe(true);
  expect(button("Move plan 1 down").disabled).toBe(true);
});

test("the features are refused on their field past twelve, or past 120 characters a line, and the plan keeps its own", () => {
  const kit = editorKit({ document: widgetPage(), selection: "pricing" });
  kit.render(<BlockPanel id="pricing" />);
  const before = plans(kit)[0]!.features;

  const field = write("Features 1", Array.from({ length: 13 }, (_, k) => `Feature ${k + 1}`).join("\n"));
  expect(field.getAttribute("aria-invalid")).toBe("true");
  expect(describedText(field)).toContain("Up to 12 features, one a line.");
  expect(plans(kit)[0]!.features).toEqual(before);

  write("Features 1", `Short\n${"x".repeat(121)}`);
  expect(describedText(field)).toContain("Up to 120 characters on each line.");
  expect(plans(kit)[0]!.features).toEqual(before);

  // Twelve lines of 120 characters are the most it takes.
  const most = Array.from({ length: 12 }, (_, k) => `${"F".repeat(118)}${String(k).padStart(2, "0")}`);
  write("Features 1", most.join("\n"));
  expect(field.getAttribute("aria-invalid")).toBeNull();
  expect(plans(kit)[0]!.features).toEqual(most);
});

test("a link the page refuses is refused on the plan's Button link field, as on a button block's Link", () => {
  const kit = editorKit({ document: widgetPage(), selection: "pricing" });
  kit.render(<BlockPanel id="pricing" />);
  const link = write("Button link 2", "javascript:alert(1)");
  expect(link.getAttribute("aria-invalid")).toBe("true");
  expect(describedText(link)).toContain("Use a full address (https://…)");
  expect(plans(kit)[1]!.button).toEqual({ label: "Choose Plus", href: "#" });
});

test("the server's 422 on a plan's link shows on its Button link field, and on one of its features under its Features field", () => {
  const kit = editorKit({ document: widgetPage(), selection: "pricing" });
  kit.render(<BlockPanel id="pricing" />);
  act(() => kit.refuse("pricing", "/props/plans/1/button/href", "pattern", "does not match the pattern"));
  const link = screen.getByLabelText("Button link 2");
  expect(link.getAttribute("aria-invalid")).toBe("true");
  expect(describedText(link)).toContain("Use a full address (https://…)");
  expect(screen.getByLabelText("Button text 2").getAttribute("aria-invalid")).toBeNull();
  expect(screen.getByLabelText("Button link 1").getAttribute("aria-invalid")).toBeNull();

  act(() => kit.refuse("pricing", "/props/plans/0/features/2", "maxLength", "is longer than 120 characters"));
  expect(screen.getByText("Up to 120 characters.")).toBeTruthy();
  expect(screen.queryByText(/The server refused the last save/)).toBeNull();
});
