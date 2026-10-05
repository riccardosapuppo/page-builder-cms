import { TYPE_NAMES } from "../../document/labels.ts";
import type { WidgetDefinition } from "../types.ts";
import { icon } from "./icon.ts";
import { FormRender } from "./render.tsx";

export const form: WidgetDefinition<"form"> = {
  type: "form",
  group: "forms",
  label: TYPE_NAMES.form,
  icon,
  needs: null,
  // A name, an email address and a message: a form someone can send as it
  // comes, and the commonest start.
  props: () => ({
    items: [
      { name: "name", kind: "text", label: "Name", required: true, maxLength: 100 },
      { name: "email", kind: "email", label: "Email", required: true },
      { name: "message", kind: "textarea", label: "Message", required: false, maxLength: 1000 },
    ],
    submitLabel: "Send",
    confirmation: "Thank you. Your message has reached us.",
  }),
  render: FormRender,
  traps: ["f-every-kind", "f-markup", "f-\"><b>id</b>", "f-long", "f-unknown", "f-limits", "f-no-items", "f-items-object"],
};
