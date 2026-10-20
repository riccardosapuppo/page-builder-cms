// The Assistant's drawer (./AssistantPanel.tsx) on a provider of the test's
// own: after a page, the tokens it used, in, cached and out, and what they
// come to at the model's list price, the price and the day it was read
// named; at the drawer's foot, the total of every request since the key was
// connected, with what an estimate leaves out, gone with the key. A model
// with no price on file is said to have none; a sample says no model was
// asked, and adds nothing.
// @vitest-environment jsdom
import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { editorKit } from "../../test/editor-kit.tsx";
import type { ModelChoice, ProviderClient, Usage } from "../assistant/providers.ts";
import { AssistantPanel } from "./AssistantPanel.tsx";

const PLAN = JSON.stringify({
  title: "Open day",
  description: "",
  sections: [{ label: "Hero", anchor: "", background: "none", widths: "equal", columns: [{ align: "left", blocks: [{ kind: "heading", level: 1, text: "Open day at the slipway", display: true }] }] }],
});

// 3,144 tokens in, 1,024 of them read from the cache, and 1,415 out.
const USED: Usage = { input: 2120, cacheRead: 1024, cacheWrite: 0, output: 1415 };

function setUp(models: ModelChoice[] = [{ id: "gpt-6.1-sol", name: "gpt-6.1-sol" }]) {
  let pages = 0;
  const client: ProviderClient = {
    models: async () => models,
    ask: async (_key, _question, written) => {
      written(PLAN);
      return { text: PLAN, usage: USED };
    },
  };
  const kit = editorKit({
    document: { schemaVersion: 1, title: "Start", sections: [] },
    session: { makePage: async () => ({ ok: true, id: ++pages }), isOpen: (id) => id === pages },
    providers: async () => client,
  });
  kit.render(<AssistantPanel />);
  return kit;
}

const connect = async (kit: ReturnType<typeof editorKit>) => {
  await act(async () => {
    await kit.assistant.getState().connect("openai", "sk-not-a-real-key");
  });
};

async function writeThePage() {
  fireEvent.change(screen.getByLabelText("What is the page for?"), { target: { value: "An open day at the club." } });
  fireEvent.click(screen.getByRole("button", { name: "Write the page" }));
  await act(async () => {
    await new Promise((done) => setTimeout(done, 20));
  });
  expect(screen.getByRole("heading", { level: 3, name: "Written" })).toBeTruthy();
}

const foot = () => document.querySelector(".drawer-foot");

test("after a page: the tokens in, cached and out, then what they come to at the model's list price, the price used and the day it was read", async () => {
  const kit = setUp();
  await connect(kit);
  expect(foot()).toBeNull();
  await writeThePage();
  expect(screen.getByText("Used 3,144 tokens in, 1,024 of them cached, and 1,415 out, on your key.")).toBeTruthy();
  // 2,120 × $2 + 1,024 × $0.10 + 1,415 × $10 a million tokens: $0.0184924.
  expect(screen.getByText("≈ $0.018 at gpt-6.1-sol's list price ($2 in, $0.10 cached, $10 out per million tokens; prices of 20 Oct 2026).")).toBeTruthy();
});

test("the drawer's foot keeps the total since the key was connected, says it is an estimate, and goes with the key", async () => {
  const kit = setUp();
  await connect(kit);
  await writeThePage();
  expect(foot()?.textContent).toBe(
    "Since you connected this key: 1 request, 3,144 tokens in, 1,024 of them cached, and 1,415 out, ≈ $0.018."
    + "An estimate from the providers' list prices. The provider's bill is what counts: taxes, discounts and regional uplift are not included.",
  );
  await writeThePage();
  expect(foot()?.querySelector(".as-total")?.textContent).toBe("Since you connected this key: 2 requests, 6,288 tokens in, 2,048 of them cached, and 2,830 out, ≈ $0.037.");

  // Forgotten with the key: the page's own words stay, with what they leave out.
  fireEvent.click(screen.getByRole("button", { name: "Forget key" }));
  expect(kit.assistant.getState().spent).toEqual([]);
  expect(foot()?.querySelector(".as-total")).toBeNull();
  expect(foot()?.textContent).toBe("An estimate from the providers' list prices. The provider's bill is what counts: taxes, discounts and regional uplift are not included.");
  expect(screen.getByText("≈ $0.018 at gpt-6.1-sol's list price ($2 in, $0.10 cached, $10 out per million tokens; prices of 20 Oct 2026).")).toBeTruthy();
  // A new key starts its own total, with its first request.
  fireEvent.click(screen.getByRole("button", { name: "Clear this summary" }));
  expect(foot()).toBeNull();
  await connect(kit);
  expect(foot()).toBeNull();
  await writeThePage();
  expect(foot()?.querySelector(".as-total")?.textContent).toBe("Since you connected this key: 1 request, 3,144 tokens in, 1,024 of them cached, and 1,415 out, ≈ $0.018.");
});

test("a model with no list price on file is said to have none: only its tokens are shown, and counted", async () => {
  // A dated snapshot neither page prices by its id.
  const kit = setUp([{ id: "gpt-5-2025-08-07", name: "gpt-5-2025-08-07" }]);
  await connect(kit);
  await writeThePage();
  expect(screen.getByText("Used 3,144 tokens in, 1,024 of them cached, and 1,415 out, on your key.")).toBeTruthy();
  expect(screen.getByText("No list price on file for gpt-5-2025-08-07: only its tokens are shown.")).toBeTruthy();
  expect(foot()?.querySelector(".as-total")?.textContent).toBe("Since you connected this key: 1 request, 3,144 tokens in, 1,024 of them cached, and 1,415 out, with no list price on file.");
});

test("the sample written by hand says no model was asked, and adds nothing to any total", async () => {
  const kit = setUp();
  fireEvent.click(screen.getByRole("button", { name: "Build the sample page" }));
  await act(async () => {
    await kit.clock.advance(60_000);
  });
  expect(screen.getByText("A sample written by hand: no model was asked.")).toBeTruthy();
  expect(screen.queryByText(/tokens in/)).toBeNull();
  expect(foot()).toBeNull();
});
