// The form's panel: each field's label, type, limit and whether it must be
// filled in change the page by the form's item commands, as do new fields,
// moves and removals; a new field takes a name the form does not have, and
// a field keeps its name through every change. Button and message sets the
// button's text and the message after sending. The server's 422 shows on
// the field it names, in the group that holds it.
// @vitest-environment jsdom
import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { describedText, editorKit, groupNames, openGroups, widgetPage } from "../../../test/editor-kit.tsx";
import { BlockPanel } from "../../editor/panels/EditPanel.tsx";
import { newFieldName } from "./panel.tsx";

const fields = (kit: ReturnType<typeof editorKit>) => (kit.block("form")!.props as { items: Array<Record<string, unknown>> }).items;

function change(label: string, value: string) {
  const field = screen.getByLabelText(label);
  fireEvent.change(field, { target: { value } });
  fireEvent.blur(field);
  return field;
}

test("a new form asks for a name, an email address and a message, in two groups", () => {
  const kit = editorKit({ document: widgetPage(), selection: "form" });
  kit.render(<BlockPanel id="form" />);
  expect(groupNames()).toEqual(["Fields", "Button and message", "Shown on", "Advanced"]);
  expect(fields(kit).map((field) => [field.name, field.kind, field.required])).toEqual([["name", "text", true], ["email", "email", true], ["message", "textarea", false]]);
  expect((screen.getByLabelText("Field 1 label") as HTMLInputElement).value).toBe("Name");
  expect((screen.getByRole("switch", { name: "Field 1 must be filled in" }) as HTMLInputElement).checked).toBe(true);
  // An email address has no limit of its own to set.
  expect(screen.getByLabelText("Field 1 longest answer")).toBeTruthy();
  expect(screen.queryByLabelText("Field 2 longest answer")).toBeNull();
});

test("a field's label, type, limit and requirement are each one command, and its name stays", () => {
  const kit = editorKit({ document: widgetPage(), selection: "form" });
  kit.render(<BlockPanel id="form" />);

  change("Field 1 label", "Your name");
  expect(kit.lastCommand()).toMatchObject({ kind: "items", label: "Changed field 1 in Form in Widgets" });
  expect(fields(kit)[0]).toEqual({ name: "name", kind: "text", label: "Your name", required: true, maxLength: 100 });

  change("Field 1 longest answer", "80");
  expect(fields(kit)[0]).toMatchObject({ maxLength: 80 });

  // A line of text becomes a checkbox: the limit goes with it.
  fireEvent.click(screen.getAllByRole("radio", { name: "Checkbox" })[0]!);
  expect(fields(kit)[0]).toEqual({ name: "name", kind: "checkbox", label: "Your name", required: true });
  expect(screen.queryByLabelText("Field 1 longest answer")).toBeNull();
  expect(screen.getByRole("switch", { name: "Field 1 must be ticked" })).toBeTruthy();

  // An email address becomes a longer text: it takes the longer text's
  // own limit.
  fireEvent.click(screen.getAllByRole("radio", { name: "Long text" })[1]!);
  expect(fields(kit)[1]).toEqual({ name: "email", kind: "textarea", label: "Email", required: true, maxLength: 1000 });
  // A longer text of 1000 becomes a line, which takes at most 300: the
  // line's own limit; one of 80 would have kept its 80.
  fireEvent.click(screen.getAllByRole("radio", { name: "Text" })[1]!);
  expect(fields(kit)[1]).toMatchObject({ kind: "text", maxLength: 100 });

  fireEvent.click(screen.getByRole("switch", { name: "Field 3 must be filled in" }));
  expect(fields(kit)[2]).toMatchObject({ name: "message", required: true });
  expect(kit.lastCommand()?.label).toBe("Changed field 3 in Form in Widgets");
});

test("fields are added with a name of their own, moved and removed one at a time", () => {
  const kit = editorKit({ document: widgetPage(), selection: "form" });
  kit.render(<BlockPanel id="form" />);

  fireEvent.click(screen.getByRole("button", { name: "Add a field" }));
  expect(fields(kit)[3]).toEqual({ name: "field-4", kind: "text", label: "New field", required: false, maxLength: 100 });
  expect(kit.lastCommand()?.label).toBe("Added a field to Form in Widgets");

  fireEvent.click(screen.getByRole("button", { name: "Move field 4 up" }));
  expect(fields(kit).map((field) => field.name)).toEqual(["name", "email", "field-4", "message"]);
  fireEvent.click(screen.getByRole("button", { name: "Remove field 1" }));
  expect(fields(kit).map((field) => field.name)).toEqual(["email", "field-4", "message"]);
  expect(kit.lastCommand()?.label).toBe("Removed field 1 from Form in Widgets");

  // With "field-4" still there, the next new field is not given it again.
  fireEvent.click(screen.getByRole("button", { name: "Add a field" }));
  expect(fields(kit).map((field) => field.name)).toEqual(["email", "field-4", "message", "field-5"]);
  expect(newFieldName([{ name: "field-2", kind: "email", label: "A", required: false }, { name: "field-3", kind: "email", label: "B", required: false }])).toBe("field-4");
});

test("the button's text and the message after sending are the form's own", () => {
  const kit = editorKit({ document: widgetPage(), selection: "form" });
  kit.render(<BlockPanel id="form" />);
  openGroups("Button and message");
  change("Button text", "Send request");
  expect(kit.block("form")?.props).toMatchObject({ submitLabel: "Send request" });
  expect(kit.lastCommand()?.label).toBe("Changed Form button text in Widgets");
  change("Message after sending", "Thank you.\nWe reply within two days.");
  expect(kit.block("form")?.props).toMatchObject({ confirmation: "Thank you.\nWe reply within two days." });
  expect(kit.lastCommand()?.label).toBe("Changed Form message in Widgets");
});

test("the server's 422 shows on the field it names, in the group that holds it", () => {
  const kit = editorKit({ document: widgetPage(), selection: "form" });
  kit.render(<BlockPanel id="form" />);
  act(() => kit.refuse("form", "/props/items/0/maxLength", "maximum", "must be less than or equal to 300"));
  const limit = screen.getByLabelText("Field 1 longest answer");
  expect(limit.getAttribute("aria-invalid")).toBe("true");
  expect(describedText(limit)).toContain("From 1 to 300.");

  // The message is the second group's: the refusal opens that group, and
  // shows there.
  act(() => kit.refuse("form", "/props/confirmation", "maxLength", "is longer than 500 characters"));
  const message = screen.getByLabelText("Message after sending");
  expect(message.getAttribute("aria-invalid")).toBe("true");
  expect(describedText(message)).toContain("Up to 500 characters.");
  expect(screen.getByRole("button", { name: "Button and message" }).getAttribute("aria-expanded")).toBe("true");
});
