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
   sections that came while the page was being made. What the request used
   is said (see [What a request costs](#what-a-request-costs)).

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

Each call hands back the tokens it used, read from the usage object of the
provider's SDK, as the provider bills them:

- **Anthropic's:** `input_tokens` at the base price,
  `cache_read_input_tokens`, `cache_creation_input_tokens` and
  `output_tokens`, the thinking included. The Assistant asks for no cache,
  so a cache write, should one come, is priced as the five-minute cache's.
- **OpenAI's:** `prompt_tokens`, of which `prompt_tokens_details.cached_tokens`
  were read from the cache and `prompt_tokens_details.cache_write_tokens`
  written to it, the rest plain input, and `completion_tokens`, the
  reasoning included.
  - **An assumption.** That both are parts of `prompt_tokens` is read from
    the SDK's description of the fields. The pricing page gives the prices,
    not how the fields add up.
  - **Parts that add up to more than the prompt** are cut to it, cached
    tokens first, and plain input never goes below none. The drawer says
    nothing of it.

An answer refused or cut short was billed all the same, and its error
says what it used.

## What a request costs

After each request the Assistant says the tokens the provider counted (in,
cached and out) and what they come to at the model's list price. After a
page it is said in the drawer, with the price used and the day the prices
were read. After a text written again or an image described, it is said in
the block's panel. The drawer's foot keeps the total of every request since
the key was connected. That total lives in memory with the key, and is
forgotten with it.

- **The prices.** [`prices.ts`](prices.ts) holds the providers' list prices
  for the models the Assistant offers, as their official pages gave them on
  20 October 2026: Anthropic's,
  <https://platform.claude.com/docs/en/about-claude/pricing>, and OpenAI's,
  <https://developers.openai.com/api/docs/pricing>. They are in US dollars
  per million tokens, at the standard tier.
  - **Anthropic's:** base input, five-minute cache write, cache read,
    output. Claude Haiku 5.5 has a second, dearer price for a prompt over
    100,000 tokens, its cache reads and writes counted in the prompt. That
    price covers every token of such a call. Claude Mythos 5.1 and Mythos 5
    are of limited availability, offered when a key may use them.
  - **OpenAI's:** input, cached input, cache writes, output, for a prompt
    of up to 272,000 tokens. Past that no list price is on file here.
    - **Cache writes** have a price of their own on the GPT-6 and GPT-5.6
      models.
    - **A dash.** Where the page gives one for cached input (the -pro
      models, o3-pro, gpt-4o-2024-05-13) or for cache writes (every other
      model), the estimate counts those tokens at the input price.
  - **The image models'** are in the table already, for the pictures a
    later step makes.
- **No price on file.** A model the table does not hold has no price, and
  only its tokens are said. That includes a dated snapshot of a model it
  holds, since neither page prices a snapshot as its model, and an alias
  such as `gpt-5-chat-latest`. A snapshot the page prices by its own id,
  as OpenAI's does `gpt-4o-2024-05-13`, has its row.
- **Exact arithmetic.** Each price is a whole number of nano-dollars per
  token, the page's dollars per million times a thousand. A cost is whole
  numbers multiplied and added, exact, and is rounded only when it is
  written. Each call is priced on its own, since a prompt's length sets its
  own call's price; [`tally.ts`](tally.ts) adds up the calls of a request,
  and of the total.
- **Written for a person.** An amount is written to two figures under a
  dollar (≈ $0.021), and one under a cent says so (under $0.01 ($0.0042)).
- **Updating the prices.** Read the two pages again, then change the rows
  of `prices.ts`, and its `PRICES_READ` to the day they were read.
  [`prices.test.ts`](prices.test.ts) holds the rows to a second copy of the
  pages' tables, typed apart so that a slip in either shows: change both.
  Two of its tests keep the table current:
  - one fails once the prices are more than 120 days old, to say it is time
    to read the pages again;
  - one holds the models the Assistant offers to the table: each is priced,
    or is listed as having no price on file.
- **What it leaves out.** It is an estimate from the list prices: the
  provider's bill is what counts. It leaves out:
  - taxes, discounts and credits;
  - US-only routing, which Anthropic bills at 1.1 times (`inference_geo`,
    which the Assistant does not set), and any other regional uplift;
  - a service tier other than the standard one;
  - a request stopped midway, whose tokens the provider never said.
