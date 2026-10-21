# The Assistant

A model of the person's own choosing writes for the editor: a whole page
from a brief, with the pictures it needs made for it, or a new site of its
own, with its own style, header and footer and its pages; a text written
again; the alternative text of an image. The person brings the key,
Anthropic's or OpenAI's, and the editor talks to that provider straight
from the browser. No server of this site sees the key or the words.

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
  smaller first), the new key is not lent to the old provider. A page's run
  takes the ticket when it begins, for its plan and its pictures alike (see
  [Pictures made for a page](#pictures-made-for-a-page)), and a new site's
  once, for its direction, each of its pages and all its pictures. The page's
  Content-Security-Policy lets the editor connect only to its own site and
  the two providers' APIs.

Storing the key encrypted would protect less than it seems: whatever runs on
the page to decrypt it can be made to decrypt it. Not storing it is the
guarantee that holds.

## A page from a brief

[`write.ts`](write.ts) runs the steps:

1. **The question.** [`prompts.ts`](prompts.ts) asks for a plan in a small
   schema of its own, [`plan.ts`](plan.ts): sections of columns of blocks,
   each block a kind and its words, and each section its background, its
   picture and its motion. The question carries the site's palette, its
   library of images (each with its shape, wide or tall, and its size), its
   pages and its icons, the forty-eight of the icon box with the words each
   stands for ([`../widgets/iconbox/words.ts`](../widgets/iconbox/words.ts)).
   - **What the model writes.** The plan names only the blocks a model can
     fill without inventing facts: headings, text, lists, buttons, images
     (the library's, or made for the page), icon boxes, quotations,
     questions and answers, steps, one form, dividers. Stats and pricing too, but their figures
     and prices only as the brief gives them, which the question says.
   - **A page with rhythm.** The question asks for a strong opening, bands
     that alternate their background and how much they hold, points side
     by side as icon boxes under a heading that announces them, figures
     and steps where the brief gives them, one clear call to action said
     again at the end, and motion with restraint: an opening that stands
     still, a few bands that rise or fade in. A section may have a picture
     of the library behind it, by id, with a veil and the point of it to
     keep in view; at most two on a page. Its rules on facts are the same
     as before.
   - **Pictures made for it.** Where the person's provider makes pictures
     and the person wants them, the question says so, and the plan's
     schema takes them ([`plan.ts`](plan.ts), `planSchema(true)`): a
     section's picture, or an image, may be made for the page, said as what
     it shows (a prompt), its alt text and its shape. A few at most, five,
     where they matter: the opening's, a band that shows what the page
     offers, cards side by side. Never words inside one, and any people
     generic, never a real person or a brand. See
     [Pictures made for a page](#pictures-made-for-a-page).
   - **What it leaves out.** No videos, maps or galleries, because their
     ids and coordinates would be made up. No logo or menu either: those
     belong to the site's header and footer.
2. **The answer, as it streams.** [`plan-stream.ts`](plan-stream.ts) hands
   on the plan's title the moment it has come, and the editor makes a new
   page with it, aside: it does not open it (see
   [Written aside](#written-aside)). Each section is handed on the moment
   its last character has come.
3. **Each section, built.** [`build.ts`](build.ts) turns it into the page's
   blocks and puts it on the page with a command of its own, held to the
   page's schema like any other edit by the reducer, on the page's document
   in memory. The page arrives whole, as its draft: none of its sections is
   a step in the History of the page the person has open, nor in the new
   page's once it is opened.
   - **Read without trust.** Words are cleaned and cut at a word to the
     schema's lengths.
   - **Headings in order.** There is one level 1, and no level is skipped.
   - **Links.** A button leads only to a section of the plan, a page of the
     site, or an address, email or phone number written in the person's own
     brief. A plan's button in a pricing block follows the same rules, but
     stays with its plan: where its address cannot be kept, it keeps its
     words and leads to the top of the page (`#`), as a new button does.
   - **Images and forms.** An image is the library's, by id, or one made
     for the page. A form's fields get names from their labels, and a page
     takes one form.
   - **A section's picture** is the library's too, by id, one made for the
     page, or none: an id the library does not have leaves the picture
     out, with a note. Its veil must let the section's words read on it,
     on the site's own colours, by the same measure as the panel's check
     (4.5 to 1 where the picture is lightest or darkest,
     [`../shared/veil.ts`](../shared/veil.ts)): a veil too faint is made
     strong; one that still is not enough gives way to the first other
     strong veil the words read through (dark, the text colour's, light),
     which on a dark site is the text colour's; with none, the picture is
     left out. Each is said in a note.
   - **A picture to be made** goes in later: the section goes in under its
     veil and focus, without it, and a column whose image is still to
     come is kept for it, empty. A page takes five; one more, one where no
     picture is made, or one that says nothing of what it shows is left
     out, said.
   - **Motion** is one of the schema's, or none.
   - **One band.** A heading's section and the points it announces after
     it, side by side on the same background with no picture behind
     either, read as one band: the points' section takes no space above,
     so one gap of the theme's stands between the two, not two.
   - **Lists of a widget's own.** Stats keep their first eight figures,
     steps their first ten, and pricing its first four plans, each with
     its first twelve features. Stats with no figure, steps with fewer than
     two, or pricing with no plan are left out.
   - **Notes.** What cannot be made to fit is left out and said in a note.
4. **Its pictures**, once its section is in, are made, put in the library
   and put on the page, each by a command of its own (see
   [Pictures made for a page](#pictures-made-for-a-page)).
5. **The end.** However the answer ends, any button whose section never
   came is taken out, and a plan's button loses its link. A stop or a
   refusal midway keeps what is already in, and a stop lets nothing more
   land, not even sections that came while the page was being made. The
   page is written once its pictures are in; then its end is told to the
   editor, which saves it (`PageHooks.end`), and a page whose last changes
   were not saved is said so, and marked. What the request used is said
   (see [What a request costs](#what-a-request-costs)).

## Pictures made for a page

Where the person chooses the provider, the drawer says what each one does
here: OpenAI writes pages and makes photos for them, each at a cost shown
before; Anthropic writes pages and draws illustrations for them, as its
models make no photos ([`pictures.ts`](pictures.ts)). Before a page is
written, a switch, on by default, makes pictures for it.

- **OpenAI's key: photos.** One Images API request each
  ([`openai.ts`](openai.ts), `photos`), with the newest GPT Image model the
  key may use, a dated snapshot left to its model: at its shape's size
  (1536 by 1024, 1024 by 1024 or 1024 by 1536), as a WebP at compression
  80, at the quality the person chose (low, medium or high; medium at
  first). Beside the choice, before anything is made, what a photo costs
  at that quality: GPT Image 2's price per image, as the image generation
  guide gives it ([`prices.ts`](prices.ts)); for a model with no price per
  image on file, that its cost is said after each photo, from the tokens
  it used. A key that may use no GPT Image model writes its page without
  photos, and the drawer says so.
- **Anthropic's key: illustrations.** One request each to the model the
  person chose ([`prompts.ts`](prompts.ts), `illustrationQuestion`), its
  answer one SVG in a schema of its own: flat, simple vector art in the
  site's palette, given as hex, in the viewBox of its shape, a few
  kilobytes, no words.
  - **Cleaned.** [`svg.ts`](svg.ts) reads the SVG with a small parser of
    its own and writes it out anew from a strict allowlist: shapes in
    groups, gradients with their stops named by a local id, the shapes'
    geometry, fill, stroke, opacity, a transform of numbers, and the
    root's viewBox and xmlns. Anything else refuses the whole drawing:
    script, style, foreignObject, image, use, a link, words, an event
    handler, href, `url()` of anything but a gradient of its own, a
    DOCTYPE, an entity or any `&`, CDATA, an instruction, more than 64 KB.
    Every value is checked token by token, so no check takes longer than
    the value is long.
  - **Drawn.** [`draw.ts`](draw.ts) draws the clean SVG as an image, from
    a `blob:` address (the editor's Content-Security-Policy allows it for
    images), to a canvas at its shape's size, and keeps the canvas as a
    WebP, or a PNG where the browser writes no WebP. What goes to the
    library is that picture, never the SVG.
- **Asked once.** A photo's request and an illustration's are never tried
  again by the SDK (`maxRetries: 0`, `Question.once`), within the client's
  own timeout: one that timed out may still have been billed. One that
  fails or times out is said in the notes, and nothing is asked again
  behind the person's back. The page's own question keeps the SDK's retry.
- **Asked for as its section lands** ([`write.ts`](write.ts)): two at once
  at most, the others waiting their turn, each line of the drawer's steps
  saying where its picture stands (waiting, being made, going into the
  library, in with what it cost, left out, stopped).
- **Into the library, like an upload** (`../editor/library/service.ts`,
  `put`): with the plan's alt text, named after the page and what it
  shows (`gym-a-coach-beside-a-lifter.webp`), into the CMS's library or
  the browser's. A photo is read for what it is (WebP, PNG or JPEG, by its
  bytes) and its size, and drawn smaller only past the editor's longest
  side.
- **Onto the page, by a command of its own.** Behind its section with the
  veil it went in with (`makeSetPicture`), or as an image in its column,
  after the blocks the plan put before it, decorative where its alt text
  is empty, and counted as a use of its image where it is placed.
- **One that fails** (refused, not clean, too large, the network, the
  library's refusal) leaves its section as it was, and is said in a note.
  A refusal of the key, of the model, for credit or for no network asks
  for no more pictures: the same would come again.
- **Stop**, or the run window closed (which asks first, and then stops the
  run), stops the pictures still being made, those in flight too. One
  already made was paid for: it goes into the library, not onto the page,
  and the note says so; the note says too how many were not made, and why.
  The page's hooks are asked before each picture is asked for, after each
  that fails, and every quarter of a second meanwhile (`PAGE_WATCH_MS`),
  whether the page is still the one being written (`PageHooks.still`):
  hooks of a page a person may leave stop its pictures there. The editor's
  never do: they write the page aside, and nothing leaves it.
- **With the key the page began with.** A page's run is bound to the key
  kept when it began ([`context.tsx`](context.tsx), `bind`): its provider,
  the keeper's ticket and the models chosen then. Its plan and each of its
  pictures are asked with that key alone. Once that key is forgotten or
  another is kept, the run is told: its pictures in flight are stopped,
  the rest are never asked, with that key or the new one, and nothing of
  the run counts toward the new key's total.

## A new site from a brief

The drawer offers two choices: a page for this site, as above, or a new
site. The new site is said plainly before anything is asked: it gives the
site a new style, a new header and a new footer; it adds three or four
pages; the pages already there stay. Its style takes the place of the old
one on every page at once, the published ones too, as a change in Site
style does; the header, the footer and the pages are drafts until they are
published. Beside its Write, before anything is made, what its pictures may
cost at most for the whole site (its budget, `SITE_PICTURES_MOST`, eight,
at the dearest price per photo of the quality chosen; for illustrations,
that each is a request of its own), and that its words cost a few cents
with most models, said exactly after. Its Write asks twice, as Delete does.

[`site.ts`](site.ts) runs it, bound to the key kept when it begins (one
`bind()` for the whole site), in steps the drawer groups by page:

1. **The direction** ([`direction.ts`](direction.ts),
   [`prompts.ts`](prompts.ts), `directionQuestion`): one request whose
   answer, in a schema of its own made for the site style, is the site's
   direction: its name (the brief's own, or two or three words made from
   it), a tagline and its voice; a colour for every slot of the site style,
   as `#rrggbb`, each with its role; a type scale and a letter width among
   the style's own choices; a sentence on its imagery, photos or
   illustrations as the person's provider makes them; how much motion
   (none, little or some); the call to action a visitor takes first; and
   three or four pages, each a title, a short address and a purpose, the
   first the home page. The question says the brief is the only source of
   facts: the direction names no price, date, address or review.
   - **Read without trust.** Words cleaned and cut at a word, a colour that
     is not `#rrggbb` keeping the site's own, a type scale or a letter width
     not among the style's keeping the style's own, an address made an
     address and made free, the pages kept to four; each said in a note.
     One with no page, or not written as a direction, is no direction, and
     nothing is changed.
   - **Held to AA.** Every text pair the palette makes is held to 4.5 to 1,
     as Site style's checks measure it: the text on the background, the
     background's colour on primary and on muted (a button's, a band's
     words, which are the links' and captions' colours on the background
     too), the text's on accent and on soft. A colour that fails is made
     lighter or darker in OKLab by as little as passes, its hue and its
     chroma kept as far as sRGB holds them, and the note says from what to
     what, and at what ratio (`fixPalette`). The colours others are
     measured against are settled first: the background is never changed.
2. **The style**: the direction's palette, type scale and letter width,
   through the storage's own call, as Site style saves it, asking it to
   keep the style it replaces (`kept: "now"`); that style is kept in memory
   too (`SiteWriting.before`). Put the old style back puts it back in one
   click, from the drawer or from Site style, until the next new site keeps
   another (`kept: "none"`). A style the storage refuses stops the site
   there.
3. **The header and the footer** ([`frame.ts`](frame.ts)), built here from
   the direction, never written freely by the model, in the site's own
   blocks: the header one row on the background's band, the name as a word
   mark (a logo with `mark: false`) linking home, a menu of the new pages,
   and the call to action as a button in the primary colour; the footer on
   the text's band, the name, the tagline and the pages again. Each is
   saved as its part's draft, the draft it replaces kept first as a version
   named "Before the new site", so History brings the old one back. No
   draft is saved over that a version does not hold, unless it is the
   run's own: the editor reads the draft first, keeps it, then saves over
   it at the revision it read; a save from another tab in between meets a
   conflict, and that draft is read and kept in turn before it is
   replaced (`replacePart`, [`../editor/App.tsx`](../editor/App.tsx)). A
   save whose answer is lost is told from the draft read back: saved where
   the draft's last save is this one, or where the draft moved past the
   revision it was sent at and is the document sent; not moved, it may
   land still, and stays in doubt while the save is tried again, so that a
   failure after it is no sure one. Where the draft cannot be read either,
   or the tries end with a save still in doubt, what became of it is
   unknown, and the run counts the part as saved, with the revision that
   save was sent at, for its clean-up to make sure of (5). A header that
   stayed at the top of the window keeps doing so.
4. **The pages**, one after the other, each written as a page is (above),
   with the direction in its question (`pageQuestion` with a
   `PageDirection`): the site's name and voice, its colours with their
   roles, its imagery, its motion, its call to action, the page's own title
   and purpose, and the new site's pages, with theirs, which its buttons may
   lead to. Its words are measured on the new palette's colours over a
   veil (`SiteFacts.ink`), and its illustrations drawn in them: the
   pictures' maker is made once the direction is read.
   - **One queue, one budget.** The pictures of every page go through one
     queue, two at a time in all, and share the site's budget: each page is
     told how many it may have made, as many as are left keeping one for
     each page still to come, five at most, and is held to it
     (`SiteFacts.most`). The imagery sentence goes with every photo's
     prompt and every illustration's question. A page waits for its
     pictures, and for its end, where the editor saves it, before the next
     one is asked for.
5. **The frame settled**, however the run ends once a part is saved:
   through, stopped (during the frame's own saves too), refused, the key
   forgotten; once every page made has ended, so that what follows reads
   their drafts as saved. The header and the footer are built
   again from the pages made, at the addresses they were made at, and the
   header's call to action leads to the home page's form, by the anchor of
   its section, or else to its first section; each is saved again where it
   changed. Where no page was made, each is put back as it was, said, and
   its step says so. A part whose first save is only maybe made is saved
   again, or put back, at the revision read, even where its draft is the
   document already, as long as the draft has not moved past the revision
   that save was sent at: the storage moves the revision with every save
   and takes a save only at the revision it was sent at, so the doubtful
   save can never land after it. Held open in the editor at that revision
   with nothing to save, the part stays one to check.
   - **The pages' links.** A button of a page made that leads to a page of
     the site not made loses its link: it leads to the top of its own page
     (`#`), as a plan's button whose section never came; one that leads to
     a page made at another address leads there. Each is said. A page not
     open is changed on its draft, read again and changed again where
     another tab saved it meanwhile (`changeDraft`).
   - **Never a link to nowhere.** A part or a page that may still lead to
     a page not made, its clean-up not saved, is said, the part's step says
     to check it, and the drawer then offers no Publish all.

- **The home page** becomes the site's home only when the person says so,
  once the site is written: nothing takes it from the site behind their
  back. Nothing is published by the Assistant either.
- **The person's own page** stays open all along: the pages are written
  aside, and the run window keeps the person on the page they had open
  while the run goes. So another page opened no longer stops the site, as
  it did when the pages were written in the editor, one opened after the
  other.
- **Stop** stops all of it: the request on its way, the pictures in flight,
  the pages still to come. A page the model refuses is said and the next
  one written; a key refused, a model gone, no credit or no network stops
  the run. What was made stays and is said, the frame settled as above.
- **At the end**, one offer, each asked: make the new home page the site's
  home page, and publish all it made (its pages, and the header and the
  footer where they are the new site's); and Put the old style back. In
  the browser demo, Start over with the example site brings the example
  site back whole, as the demo's line does for a newer edition. Publish
  all is not offered while a page or a part may still lead to a page not
  made, or a page's last changes were not saved.

## Written aside

The Assistant never writes into the page the person has open
([`../editor/assistant-aside.ts`](../editor/assistant-aside.ts)): a page
written in the open editor, section by section, kept the editor busy, and
felt as if it was locked. Each page of a run, a page's, the sample's or a
new site's, is written aside:

- **Made, not opened.** The page is made with the storage
  (`Session.makePageAside`), at its address or, taken, the next free one,
  and the editor stays where it is.
- **Written in memory.** Each command the run makes is applied by the
  reducer ([`../document/reducer.ts`](../document/reducer.ts)) to the
  page's document in memory, held to the page's rules as any edit is.
  Nothing goes on the editor's store: not its page, not its selection,
  not its History, and nothing scrolls.
- **Saved by an autosave of its own**
  ([`../storage/autosave.ts`](../storage/autosave.ts)), as an open page is:
  after a pause, one save on its way at a time, a save whose answer is lost
  sent again. At the page's end, however it comes (written, stopped,
  failed), its saves are flushed, and the autosave let go once the page is
  saved. A flush that does not end saved is said in the notes ("Its last
  changes were not saved: ..."), the page marked so; one whose answer was
  lost goes on being sent until it is kept. Until the autosave is let go,
  closing the tab while the page's edits are only here asks first, as for
  the page open. A new site's clean-up comes after its pages' ends, and
  reads their drafts as saved.
- **Shown as it grows** in the run window's preview, four times a second
  at most.

The page arrives whole, as its draft: it is opened with Open the page,
from the run window, or later from the pages, and none of its sections is
a step in History. A new site's style still takes the place of the old one
on every page at once, the open one too, and its header and footer are
saved as the parts' drafts as before (`replacePart`), through the open
part where the person has it open.

## The run window

A run (Write the page; Write the new site, once asked twice; Build the
sample page) opens a window over the editor
([`../editor/AssistantRun.tsx`](../editor/AssistantRun.tsx)), which waits
behind it, inert:

- **What the drawer says of the run, and more.** Its phase as the
  window's title; its status line, the run's one live region (the
  drawer's, behind it, says nothing meanwhile); a bar of how far it has
  come (a new site's own four steps and its pages, once its direction
  names them; a page's sections and pictures, once its plan has said how
  many sections; moving, with no measure, before); the steps as the drawer
  lists them.
- **The cost, large** (see [What a request costs](#what-a-request-costs)):
  so far, to four decimals, as the run goes, its tokens in, of them cached,
  and out, each model at its list price and the day the prices were read,
  the photos being made counted at their price per image, the requests
  whose cost is not known, all a live estimate made exact as each request
  ends; in all once it is over, said as the drawer says it, with what
  every estimate leaves out. The sample's says nothing is spent.
- **The preview**: the page being written, drawn by the site's renderer
  ([`../render/page.tsx`](../render/page.tsx)) with the site's style and
  its header and footer (a new site's own, once saved), at a desktop's
  width, 1280, made smaller to fit, not to be edited, its pictures from the
  library as they go in. It follows the newest section as it lands,
  unless the person scrolls it, and says in words what it shows ("Preview
  of “Home”, 4 sections"). Once the run is over, it shows the page, or a
  new site's home page, with a switch for each page the site made.
- **Closing it while the run goes asks first** (its close key, Esc, the
  scrim, or its Stop key): Stop the Assistant? says what stays (what was
  made, as drafts; for a new site, its style, which Put the old style back
  returns), with Keep writing, the safe answer, and Stop. From its close,
  Stop stops the run and closes the window; from its Stop key, the window
  stays, to show what stays and what it cost.
- **Once over** it stays open, saying how the run ended: Done closes it;
  Open the page, or Open the home page for a new site (the page planned
  home, else the first page made), opens it in the editor and closes it.
  Closing it then asks nothing. The drawer keeps the summary and the new
  site's offers.
- **On a phone's window** it is the whole window, Progress and Preview a
  switch apart.

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
  Its photos are one Images API request each (`images.generate`), with the
  newest GPT Image model the key may use, found when the key is connected.

Errors are said in a sentence, read from the HTTP status, with the key
taken out of anything the provider repeated of it. A call its caller
stopped is said to be stopped, whatever the SDK threw: neither SDK's abort
error carries its class's name.

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

- **A photo's:** the Images API's usage, `input_tokens`, of which
  `input_tokens_details.image_tokens` were pictures sent with the words (a
  page's photo sends none), the rest words, and `output_tokens`, the
  picture made.

An answer refused or cut short was billed all the same, and its error
says what it used; so was an illustration the cleaner refused.

## What a request costs

After each request the Assistant says the tokens the provider counted (in,
cached and out) and what they come to at the model's list price. While a
page or a new site is written, what it has cost so far grows in the run
window's meter, large, and under the drawer's status line, a live
estimate made exact as each request ends (see **As it is written**, below). After a page it is said in the drawer, with
the price used and the day the prices were read: the page's words, then a
line for each kind of picture made for it ("4 photos, ≈ $0.16: ...", its
tokens and price), then the whole; and each picture's own cost in the
drawer's steps, as it comes in. A new site says the same once it is
written, its direction's and its pages' words together. After a text
written again or an image described, it is said in the block's panel. The
drawer's foot keeps the total of every request since the key was
connected, the pictures counted by their kind: what the providers
counted, never an estimate. That total lives in memory with the key, and
is forgotten with it.

- **As it is written** ([`live.ts`](live.ts)). Each request of the run
  counts from the moment it is sent:
  - its input as the provider counted it, as soon as the provider says it:
    Anthropic's stream does as it begins (`message_start`). OpenAI's gives
    its count only with its last piece: until then the input is estimated
    from the question's characters, its system words, its text and its
    schema;
  - its output estimated from the characters of the answer streamed so
    far: 4 a token at first, then the ratio the run's requests that ended
    have shown, the characters they streamed over the output tokens
    counted for them. That ratio takes in the thinking, billed as output
    but never streamed. The input's estimate is made the same way, at a
    ratio of its own;
  - a photo at its price per image, the dearest on file for its size where
    its model has none; an illustration as the words are.

  Each estimate is priced as a count is, at the model's list price for its
  prompt's length, and the line says it: "≈ $0.0123 so far · 3,144
  tokens in, 1,215 out · live estimate, exact as each request ends". It is
  told a few times a second at most, and is no live region: the status
  line stays the only one. As a request ends, the provider's count takes
  its estimate's place. One stopped or failed before the provider counted
  it drops its estimate: what it cost, if anything, is not known, as the
  page's words say when its own request was stopped. Once the run is over,
  the words above say the whole. The sample asks no model, and its line
  says nothing is spent.

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
  - **The image models':** text in, image in, image out, per million
    tokens. A photo is priced from its tokens at them, the page's image
    in price only for a picture sent with the words (none is), and every
    token out at the image out price: the page gives no other for what a
    picture model writes. An illustration is a call to the model that
    writes, at its own price, counted as an illustration.
  - **GPT Image 2's price per image**, by quality and size, from the image
    generation guide, is what the drawer shows before a photo is made. No
    other model has one on file: its photos' cost is said after each.
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
  A run's cost while it grows is written to four decimals (≈ $0.0123), so
  that its figures keep their place.
- **Updating the prices.** Read the two pages again, and the image
  generation guide's price per image, then change the rows of
  `prices.ts`, and its `PRICES_READ` to the day they were read.
  [`prices.test.ts`](prices.test.ts) holds the rows to a second copy of the
  pages' tables and the guide's, typed apart so that a slip in either
  shows: change both.
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
