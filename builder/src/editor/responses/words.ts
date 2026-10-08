// The words of the responses screen (./ResponsesScreen.tsx), in the
// editor's one locale, en-US. Plain functions of their arguments, so the
// tests give what they mean.
import type { FormResponse, KeptField } from "../../storage/adapter.ts";

const counted = (count: number, one: string): string => `${count} ${count === 1 ? one : `${one}s`}`;

// The header's count: "No responses yet", "1 response to 1 form",
// "14 responses to 3 forms".
export function countLine(responses: number, forms: number): string {
  if (responses === 0) return "No responses yet";
  return `${counted(responses, "response")} to ${counted(forms, "form")}`;
}

// A form's count in the list: "1 response", "12 responses".
export const responsesCount = (count: number): string => counted(count, "response");

// The names of a list's rows from the times they show, newest first: the
// time alone, or, where rows sent in the same minute show the same, the
// time numbered from the newest ("Today, 9:00 AM (2)"), so each row's
// button has a name of its own. Counted from the newest, a row keeps its
// number when older rows are read below it.
export function rowNames(times: readonly string[]): string[] {
  const total = new Map<string, number>();
  for (const time of times) total.set(time, (total.get(time) ?? 0) + 1);
  const seen = new Map<string, number>();
  return times.map((time) => {
    const nth = (seen.get(time) ?? 0) + 1;
    seen.set(time, nth);
    return (total.get(time) ?? 0) > 1 ? `${time} (${nth})` : time;
  });
}

// A field's answer as the screen shows it. A text is what the visitor
// wrote, exactly, to be drawn as text; one left empty, or a field with no
// answer kept, says so in the screen's own words, which `given` tells
// apart; a checkbox, whether it was ticked.
export function answerWords(field: KeptField, answer: string | boolean | undefined): { text: string; given: boolean } {
  if (field.kind === "checkbox") return { text: answer === true ? "Ticked" : "Not ticked", given: true };
  if (typeof answer !== "string" || answer.trim() === "") return { text: "No answer", given: false };
  return { text: answer, given: true };
}

// The direction a visitor's text reads in, from its first letter, as the
// browser's dir="auto" decides it: a letter of a script written right to
// left makes it "rtl", any other letter, or none, "ltr". The screen needs
// it as a value because the excerpt's cut mark follows the text inside
// the same element, and must not be read as part of the text.
const RIGHT_TO_LEFT = /[\p{Script=Hebrew}\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Samaritan}\p{Script=Mandaic}\p{Script=Adlam}\p{Script=Hanifi_Rohingya}]/u;

export function readingDirection(text: string): "rtl" | "ltr" {
  const letter = /\p{L}/u.exec(text);
  return letter && RIGHT_TO_LEFT.test(letter[0]) ? "rtl" : "ltr";
}

// The version a response was sent from: "Version 3 of Home", and ", the
// version live now" when visitors still see that one.
export function versionWords(versionNumber: number, liveVersion: number | null, pageTitle: string): string {
  return `Version ${versionNumber} of ${pageTitle}${versionNumber === liveVersion ? ", the version live now" : ""}`;
}

// The fields of a response with their answers, in the order the form had
// them.
export function answered(response: FormResponse): Array<{ field: KeptField; text: string; given: boolean }> {
  return response.fields.map((field) => ({ field, ...answerWords(field, response.answers[field.name]) }));
}
