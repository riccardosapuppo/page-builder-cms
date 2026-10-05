// What the responses screen (./ResponsesScreen.tsx) reads and deletes
// through, given by the shell on its storage adapter when the adapter keeps
// form answers (capability responses), and null when it does not: then the
// mark's menu draws no way to the screen, since there would be nothing
// behind it. A test gives a storage of its own making the same way.
import { createContext, useContext } from "react";
import type { StorageAdapter } from "../../storage/adapter.ts";

// The site's pages, a page's draft (to name its forms as the editor names
// blocks), and the three operations on a page's responses.
export type ResponsesStorage = Pick<StorageAdapter, "listPages" | "getDraft" | "listResponses" | "getResponse" | "deleteResponse">;

const ResponsesContext = createContext<ResponsesStorage | null>(null);

export const ResponsesProvider = ResponsesContext.Provider;

export function useResponsesStorage(): ResponsesStorage | null {
  return useContext(ResponsesContext);
}

// The adapter itself when it keeps responses, null otherwise.
export function responsesOf(adapter: StorageAdapter): ResponsesStorage | null {
  return adapter.capabilities.responses ? adapter : null;
}
