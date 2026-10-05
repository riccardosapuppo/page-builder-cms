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

// A field's answer as the screen shows it. A text is what the visitor
// wrote, exactly, to be drawn as text; one left empty, or a field with no
// answer kept, says so in the screen's own words, which `given` tells
// apart; a checkbox, whether it was ticked.
export function answerWords(field: KeptField, answer: string | boolean | undefined): { text: string; given: boolean } {
  if (field.kind === "checkbox") return { text: answer === true ? "Ticked" : "Not ticked", given: true };
  if (typeof answer !== "string" || answer.trim() === "") return { text: "No answer", given: false };
  return { text: answer, given: true };
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
