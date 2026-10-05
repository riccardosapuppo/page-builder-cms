// The site's forms with responses, read page by page: only the pages ever
// published are asked, the forms come in the site's order and the draft's,
// each named as the editor names blocks, and a form the draft no longer
// has keeps its responses under a name that says so.
import { expect, test } from "vitest";
import { draftWith, FakeResponses, formBlock } from "../../../test/fake-responses.ts";
import { formNames, NO_LONGER_ON_PAGE, readSiteForms } from "./read.ts";

const heading = { id: "h", type: "heading", props: { level: 2, text: "Join us" }, style: { base: {} }, children: [] } as never;

function site(): FakeResponses {
  const fake = new FakeResponses();
  fake.page(1, "Home", 4, draftWith("Home", [{ label: "Hero", widgets: [heading] }, { label: "Join", widgets: [formBlock("join"), formBlock("join-2")] }]));
  fake.page(2, "Never live", null, draftWith("Never live", [{ label: "Join", widgets: [formBlock("draft-only")] }]));
  fake.page(3, "Winter series", 2, draftWith("Winter series", [{ label: "Sign up", widgets: [formBlock("winter")] }]));
  fake.page(4, "About", 1, draftWith("About", [{ label: "Story", widgets: [] }]));
  return fake;
}

test("the forms with responses, in the site's order and the draft's, each with its page, count and live version", async () => {
  const fake = site();
  fake.send(3, "winter", "2026-10-01T08:00:00.000Z", { "field-1": "Ann" });
  fake.send(1, "join-2", "2026-10-01T09:00:00.000Z", { "field-1": "Bo" });
  fake.send(1, "join", "2026-10-01T10:00:00.000Z", { "field-1": "Cy" });
  fake.send(1, "join", "2026-10-01T11:00:00.000Z", { "field-1": "Di" });
  fake.send(1, "gone-b", "2026-10-01T12:00:00.000Z", { "field-1": "Ed" });
  fake.send(1, "gone-a", "2026-10-01T13:00:00.000Z", { "field-1": "Flo" });

  const forms = await readSiteForms(fake);
  expect(forms.map((f) => [f.key, f.pageTitle, f.name, f.onPage, f.count, f.liveVersion])).toEqual([
    ["1:join", "Home", "Form in Join (1)", true, 2, 4],
    ["1:join-2", "Home", "Form in Join (2)", true, 1, 4],
    ["1:gone-a", "Home", `${NO_LONGER_ON_PAGE} (1)`, false, 1, 4],
    ["1:gone-b", "Home", `${NO_LONGER_ON_PAGE} (2)`, false, 1, 4],
    ["3:winter", "Winter series", "Form in Sign up", true, 1, 2],
  ]);
  // The page never published is not asked; a published page with no
  // responses is asked for its counts, and its draft is not read.
  expect(fake.calls.filter((c) => c !== "listPages").sort()).toEqual(["getDraft 1", "getDraft 3", "listResponses 1", "listResponses 3", "listResponses 4"]);
});

test("the open page is named from the editor's own draft, without asking the CMS for it", async () => {
  const fake = site();
  fake.send(1, "join", "2026-10-01T10:00:00.000Z", { "field-1": "Cy" });
  const edited = draftWith("Home", [{ label: "Come along", widgets: [formBlock("join")] }]);
  const forms = await readSiteForms(fake, (pageId) => (pageId === 1 ? edited : null));
  expect(forms.map((f) => f.name)).toEqual(["Form in Come along"]);
  expect(fake.calls).not.toContain("getDraft 1");
});

test("a site with no responses has no forms to show", async () => {
  expect(await readSiteForms(site())).toEqual([]);
});

test("a read that fails says so, with the storage's words", async () => {
  const fake = site();
  fake.send(1, "join", "2026-10-01T10:00:00.000Z", {});
  fake.fail("listResponses", { kind: "unknown", cause: "network", status: null, message: "The CMS did not answer." });
  await expect(readSiteForms(fake)).rejects.toThrow("The CMS did not answer.");
});

test("a form's name counts every form of its section in the draft, whether it has responses or not", () => {
  const draft = draftWith("Home", [{ label: "Join", widgets: [formBlock("a"), formBlock("b")] }, { label: "Footer", widgets: [formBlock("c")] }]);
  const names = formNames(draft, ["b", "c"]);
  expect([names.get("b")?.name, names.get("c")?.name]).toEqual(["Form in Join (2)", "Form in Footer"]);
  expect(formNames(draft, ["x"]).get("x")).toEqual({ name: NO_LONGER_ON_PAGE, onPage: false, order: 3 });
});
