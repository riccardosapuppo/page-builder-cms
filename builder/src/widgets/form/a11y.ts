// The form's accessibility test (../a11y.ts): each field named by its own
// label, so the label is tied to it; a line of text that must be filled
// in required in the accessibility tree and "(required)" in its name, the
// others neither; the button named by its text; and the field for robots
// nowhere a person meets it, so the textboxes are the three fields and no
// more. Chromium's tree gives a checkbox no required state, with or
// without aria-required (probed on 5 October 2026), so a box that must be
// ticked is announced by the "(required)" its label ends with, which its
// name holds.
import type { WidgetA11y } from "../a11y.ts";

export const A11Y: WidgetA11y = {
  type: "form",
  cases: [{
    name: "every kind of field, required and not",
    props: {
      items: [
        { name: "name", kind: "text", label: "Name", required: true, maxLength: 100 },
        { name: "email", kind: "email", label: "Email", required: false },
        { name: "notes", kind: "textarea", label: "Anything we should know?", required: false, maxLength: 1000 },
        { name: "distance", kind: "checkbox", label: "I can swim 200 meters without stopping", required: true },
      ],
      submitLabel: "Send request",
      confirmation: "Thank you. We reply within two days.",
    },
    exposes: [
      { role: "textbox", name: "Name (required)", required: true },
      { role: "textbox", name: "Email", required: false },
      { role: "textbox", name: "Anything we should know?", required: false },
      { role: "textbox", count: 3 },
      { role: "checkbox", name: "I can swim 200 meters without stopping (required)" },
      { role: "button", name: "Send request" },
    ],
  }],
};
