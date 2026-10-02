// The accordion's panel: each question and answer, their moves, removals
// and new questions change the page by the accordion's item commands; the
// server's 422 on one answer shows on that answer's field.
// @vitest-environment jsdom
import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { describedText, editorKit, widgetPage } from "../../../test/editor-kit.tsx";
import { BlockPanel } from "../../editor/panels/EditPanel.tsx";

const items = (kit: ReturnType<typeof editorKit>) => (kit.block("accordion")!.props as { items: unknown[] }).items;

test("questions are written, added, moved and removed one at a time", () => {
  const kit = editorKit({ document: widgetPage(), selection: "accordion" });
  kit.render(<BlockPanel id="accordion" />);

  const question = screen.getByLabelText("Question 1");
  fireEvent.change(question, { target: { value: "How cold is it?" } });
  fireEvent.blur(question);
  expect(kit.lastCommand()).toMatchObject({ kind: "items", label: "Changed question 1 in Accordion in Widgets" });

  fireEvent.click(screen.getByRole("button", { name: "Add a question" }));
  expect(items(kit)).toEqual([{ question: "How cold is it?", answer: "Its answer." }, { question: "A question?", answer: "Its answer." }]);
  expect(kit.lastCommand()?.label).toBe("Added a question to Accordion in Widgets");

  const answer = screen.getByLabelText("Answer 2");
  fireEvent.change(answer, { target: { value: "No.\nMany members swim without one." } });
  fireEvent.blur(answer);
  fireEvent.click(screen.getByRole("button", { name: "Move question 2 up" }));
  expect(items(kit)).toEqual([{ question: "A question?", answer: "No.\nMany members swim without one." }, { question: "How cold is it?", answer: "Its answer." }]);

  fireEvent.click(screen.getByRole("button", { name: "Remove question 2" }));
  expect(items(kit)).toEqual([{ question: "A question?", answer: "No.\nMany members swim without one." }]);
  expect(kit.lastCommand()?.label).toBe("Removed question 2 from Accordion in Widgets");
});

test("the server's 422 on the first answer shows on that answer's field", () => {
  const kit = editorKit({ document: widgetPage(), selection: "accordion" });
  kit.render(<BlockPanel id="accordion" />);
  act(() => kit.refuse("accordion", "/props/items/0/answer", "maxLength", "is longer than 2000 characters"));
  const answer = screen.getByLabelText("Answer 1");
  expect(answer.getAttribute("aria-invalid")).toBe("true");
  expect(describedText(answer)).toContain("Up to 2000 characters.");
  expect(screen.getByLabelText("Question 1").getAttribute("aria-invalid")).toBeNull();
});
