# The Assistant

A model of the person's own choosing writes for the editor: a whole page
from a brief, a text written again, the alternative text of an image. The
person brings the key, Anthropic's or OpenAI's, and the editor talks to that
provider straight from the browser. No server of this site sees the key or
the words.

## The key

[`key.ts`](key.ts) keeps it, and the promise is that it is kept nowhere else:

- **Only in memory.** It never goes into the browser's storage, its
  databases or a cookie. It never appears in an address, the page, its
  history or a log. Once it is forgotten, there is nothing left to read
  back, decrypt or leak.
- **Forgotten** when the person asks, after 30 minutes without a call, and
  when the page is left. Leaving covers closing or reloading the tab and
  going to another address, even into the browser's back-forward cache,
  which would otherwise bring this memory back.
- **What the interface sees** is the provider and the key's last four
  characters, for the person to recognise it.
- **Only two places it can go.** It is lent to one call at a time, which goes
  to the provider and nowhere else. A call takes the keeper's ticket when it
  starts; if another key is kept while the call is being made (an image made
  smaller first), the new key is not lent to the old provider. The page's Content-Security-Policy lets
  the editor connect only to its own site and the two providers' APIs.

Storing the key encrypted would protect less than it seems: whatever runs on
the page to decrypt it can be made to decrypt it. Not storing it is the
guarantee that holds.

## A page from a brief

[`write.ts`](write.ts) runs the steps:

1. **The question.** [`prompts.ts`](prompts.ts) asks for a plan in a small
   schema of its own, [`plan.ts`](plan.ts): sections of columns of blocks,
   each block a kind and its words. The question carries the site's palette,
   its library of images, its pages and its icons.
   - **What the model writes.** The plan names only the blocks a model can
     fill without inventing facts: headings, text, lists, buttons, the
     library's images, icon boxes, quotations, questions and answers,
     steps, one form, dividers. Stats and pricing too, but their figures
     and prices only as the brief gives them, which the question says.
   - **What it leaves out.** No videos, maps or galleries, because their
     ids and coordinates would be made up. No logo or menu either: those
     belong to the site's header and footer.
2. **The answer, as it streams.** [`plan-stream.ts`](plan-stream.ts) hands
   on the plan's title the moment it has come, and the editor makes and
   opens a new page with it. Each section is handed on the moment its last
   character has come.
3. **Each section, built.** [`build.ts`](build.ts) turns it into the page's
   blocks and puts it on the page with a command of its own. The store holds
   that command to the page's schema like any other, and History shows it as
   the Assistant's step ("Assistant added section Hero"), undoable on its
   own.
   - **Read without trust.** Words are cleaned and cut at a word to the
     schema's lengths.
   - **Headings in order.** There is one level 1, and no level is skipped.
   - **Links.** A button leads only to a section of the plan, a page of the
     site, or an address, email or phone number written in the person's own
     brief. A plan's button in a pricing block follows the same rules, but
     stays with its plan: where its address cannot be kept, it keeps its
     words and leads to the top of the page (`#`), as a new button does.
   - **Images and forms.** An image is the library's, by id. A form's
     fields get names from their labels, and a page takes one form.
   - **Lists of a widget's own.** Stats keep their first eight figures,
     steps their first ten, and pricing its first four plans, each with
     its first twelve features. Stats with no figure, steps with fewer than
     two, or pricing with no plan are left out.
   - **Notes.** What cannot be made to fit is left out and said in a note.
4. **The end.** However the answer ends, any button whose section never
   came is taken out, and a plan's button loses its link, while the page
   made is the one open. A stop, a refusal or another page opened midway
   keeps what is already in, and a stop lets nothing more land, not even
   sections that came while the page was being made.

## The providers

[`providers.ts`](providers.ts) puts both behind one interface:

- the models a key may use;
- one question, its answer JSON in a schema, streamed.

Each provider's module, with its SDK, is loaded the first time it is
called on, so a person who never opens the Assistant downloads neither SDK.

- **[`anthropic.ts`](anthropic.ts):** a streamed Messages request with
  adaptive thinking and the answer held to the schema (structured outputs).
  It offers Claude 4.6 and later, Claude Opus 5.5 first.
- **[`openai.ts`](openai.ts):** a streamed Chat Completions request with a
  strict JSON schema. It offers the models that take one, newest first.

Errors are said in a sentence, read from the HTTP status, with the key
taken out of anything the provider repeated of it.
