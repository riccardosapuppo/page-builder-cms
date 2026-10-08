// The responses screen's words: the header's count, a field's answer as
// shown (a stranger's text exactly as written; an empty one, a missing one
// and a checkbox in the screen's own words), and the version's.
import { expect, test } from "vitest";
import type { KeptField } from "../../storage/adapter.ts";
import { answered, answerWords, countLine, readingDirection, responsesCount, versionWords } from "./words.ts";

const text: KeptField = { name: "a", kind: "textarea", label: "Message", required: false, maxLength: 5000 };
const box: KeptField = { name: "b", kind: "checkbox", label: "Keep me posted", required: false };

test("the header counts responses and forms", () => {
  expect([countLine(0, 0), countLine(1, 1), countLine(14, 3), responsesCount(1), responsesCount(2)]).toEqual([
    "No responses yet",
    "1 response to 1 form",
    "14 responses to 3 forms",
    "1 response",
    "2 responses",
  ]);
});

test("a text is shown exactly as written, markup and lines included; an empty or missing one says so", () => {
  expect(answerWords(text, '  <b>hi</b>\n<a href="javascript:alert(1)">x</a>  ')).toEqual({ text: '  <b>hi</b>\n<a href="javascript:alert(1)">x</a>  ', given: true });
  expect([answerWords(text, ""), answerWords(text, " \n "), answerWords(text, undefined)]).toEqual(Array(3).fill({ text: "No answer", given: false }));
});

test("a checkbox says whether it was ticked", () => {
  expect([answerWords(box, true), answerWords(box, false), answerWords(box, undefined)].map((w) => w.text)).toEqual(["Ticked", "Not ticked", "Not ticked"]);
});

test("a text reads right to left when its first letter is of a script written that way, whatever comes before it", () => {
  expect([
    readingDirection("שלום, see you at the slipway"),
    readingDirection("12 - مرحبا"),
    readingDirection("Ann שלום"),
    readingDirection("‮exe.txt"),
    readingDirection("42 !"),
    readingDirection(""),
  ]).toEqual(["rtl", "rtl", "ltr", "ltr", "ltr", "ltr"]);
});

test("the version names its page, and says when it is the one visitors see now", () => {
  expect([versionWords(3, 3, "Home"), versionWords(2, 3, "Home"), versionWords(2, null, "Home")]).toEqual(["Version 3 of Home, the version live now", "Version 2 of Home", "Version 2 of Home"]);
});

test("a response's answers come in the order the form had its fields", () => {
  const response = { id: 1, formId: "f", versionNumber: 1, submittedAt: "2026-10-01T10:00:00.000Z", fields: [box, text], answers: { a: "Hello", b: true } };
  expect(answered(response).map((a) => [a.field.label, a.text])).toEqual([["Keep me posted", "Ticked"], ["Message", "Hello"]]);
});
