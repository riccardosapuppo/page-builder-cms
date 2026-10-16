# The shop sells a collection's entries through Stripe's Checkout in its test mode alone: settings and orders on both storages, a cart in a cookie of its own addresses, a module that can be off

Decided on 15 October 2026, with stage 14, the owner's choice of that
day, collections first and then a shop: a shop built on the collections
of stage 13
([collections-are-typed-entries.md](collections-are-typed-entries.md)),
that can be turned off and leaves the page builder as it is for a site
that sells nothing. The plan he approved: products as a collection, a
cart, Stripe's Checkout in test mode only, orders in the CMS, a module
that can be off. Its first phase, on 16 October, the model on both
sides, the CMS's tables, its JSON API and the cart's addresses, Stripe's
client and a fake of it, the editor's storage on both adapters. Its
second, the same day, the editor (below, "The editor"): the Shop screen,
a Products preset, Add to cart, prices drawn as money, and the keys of
the pages that draw them. Its third, the same day, the site (below, "The
site"): the cart and the page back from Stripe drawn in the site's frame,
the demo's own cart and checkout, and a whole checkout in a browser. Its
fourth, the example site's shop and the README's pictures (below, "The
example site").

## The question

A site with typed content may want to sell some of it: swim caps, a tow
float, a pass to a winter series. Two ways were open. An outside shop's
buttons on the pages leave the products, their prices and the orders to
another service, and put its script and its cookies on pages that carry
none. A shop of the CMS's own, built on collections, keeps the products
typed entries like any other, drawn by their template, and the orders
beside the pages; but it changes the project's posture in two places. A
cart is the visitor's own state, where until now the published pages
carry no cookie and run no script, cached and shared by every visitor; and
a payment is someone else's service, where until now the CMS talks to no
one but the editor and the visitors, and listens on 127.0.0.1 alone
([no-authentication-one-address.md](no-authentication-one-address.md)).

## The decision

- **The shop is a setting of the site**: on or off, off by default; its
  currency, one of a closed list (GBP, EUR, USD); the collection whose
  entries are its products, any collection with a number field; and that
  number field, the price. The settings are held to the shop's rules,
  written twice, in TypeScript
  ([`builder/src/shared/shop.ts`](../../builder/src/shared/shop.ts)) and in
  Ruby ([`cms/app/models/shop_rules.rb`](../../cms/app/models/shop_rules.rb)),
  each fault at its member with the keyword JSON Schema would name it by
  (`required`, `type`, `enum`, `additionalProperties`) or the rules' own
  (`collectionExists`, `numberField`, `priceField`); a shop that is on
  names both its collection and its price. Both read the same cases,
  [`contract/shop/cases.json`](../../contract/shop/cases.json), as the
  custom CSS's checkers do theirs: 26 settings, 16 prices and 7 amounts,
  9 carts as they are kept, 20 changes of a cart, 7 carts after a paid
  order and 4 carts priced.
- **What the settings name stays as it is while they name it**, on or off:
  the products collection is not deleted (409 `collection_in_shop`), and
  its price field neither goes nor takes another type (422 at `/fields`,
  or at the field's type, keyword `shopPrice`), as the field a
  collection's order follows does not go without a new order. On the CMS
  a foreign key with no cascade refuses the delete too. So the settings
  never name what is not there, and what reads them can trust them.
- **A product is a published entry of the products collection.** Its price
  is the value of the price field it went live with, in the currency's
  main unit with two decimals at most (the number field's own rule),
  counted in the smallest unit (pence, cents) by its hundredths: a hundred
  times it, rounded, which is exact for every value a number field keeps,
  so 1.15 is 115 though a hundred times it is 114.99999999999999 as a
  float. A price below zero, or none, is no price. A collection with a
  toggle field keyed `in-stock` sells only the products it is on for.
- **The cart is the visitor's, kept in a cookie that only the cart's
  addresses read and set**: its lines, a product's entry id and a quantity
  each (1 to 20, at most 20 lines), never a price, and, from a checkout
  until its order is settled, that order's id, the mark of the checkout
  this browser made; encrypted and signed with the application's secret,
  HttpOnly, SameSite=Lax, on the path `/cart`, so a browser sends it to
  the cart's addresses and to no page; kept 30 days. No session, no
  table. Every price is read from what the product published when the
  cart is drawn or checked out.
- **The cart's addresses** (`CartController`): `GET /cart`, the cart in the
  site's frame (below, "The site"); `POST /cart/items`, a product put
  in; `POST /cart/items/<entry id>`, a line's quantity set, 0 taking it
  out whatever became of its product; `POST /cart/checkout`; `GET
  /cart/thanks?session_id=<id>`. They are public writes, and have a
  visitor's form's guards
  ([form-count-by-socket-peer.md](form-count-by-socket-peer.md)), in the
  forms' order: the `Origin` must be the site's (403, nothing read or
  counted); the checkout alone, which asks Stripe, is counted as forms
  are, ten in ten minutes from one address (the socket's own peer), in a
  count of its own (429); only a form's own encoding (415) and a body of a
  kilobyte at most (413). Each id and quantity is held to the shop's rules
  and to the published products, and a refusal is the cart drawn again
  with what was refused. Nothing there is cached (`no-store`) or for
  search engines (`noindex`); with the shop off, every one is the site's
  404 page. `cart` is reserved as a page's address and as a prefix, on or
  off.
- **An order** is what a checkout asks Stripe to be paid: its lines as they
  were sold (each product's entry id, its title and unit price then, the
  quantity), the total, the currency, the id of its Checkout Session at
  Stripe, its status (open; paid; expired) and, once paid, the email the
  buyer gave Stripe and when the CMS learned it. The checkout makes the
  order open, then asks Stripe for a session of it, outside any
  transaction; an order Stripe refused, or could not be asked about, is
  deleted, since nobody can pay it.
- **Stripe, in its test mode alone, with no library of its own.** The key
  comes from the environment, `STRIPE_SECRET_KEY`, and from nowhere else;
  only a key of the test mode is taken (`sk_test_`, `rk_test_`), and a live
  key, a publishable one or anything else leaves checkout not set up, the
  reason naming which ([`StripeSettings`](../../cms/app/models/stripe_settings.rb)).
  The key is never answered to the editor, which learns only whether
  checkout is set up and why not; it is filtered from the log in any
  parameter a request carries, scrubbed from any message of Stripe's,
  even masked as Stripe masks it, and left out of the objects' `inspect`.
  The API's address is `STRIPE_API_BASE`, `https://api.stripe.com` when
  not set, and taken only when it is that or `http://127.0.0.1:<port>`;
  the tests and the e2e environment take only the second, so no test
  reaches the network whatever the shell holds. Two calls, over Net::HTTP
  ([`StripeClient`](../../cms/app/models/stripe_client.rb)): create a
  Checkout Session, of mode payment, the order's lines as price data,
  `client_reference_id` the order, back to `/cart/thanks?session_id=
  {CHECKOUT_SESSION_ID}` once paid and to `/cart` if left; and retrieve
  one.
- **The checkout sends the visitor to Stripe's page with a 303**, to the
  address the session gives, only when it is on the checkout's own
  origin (`https://checkout.stripe.com`, or the fake's): a browser holds a
  form's redirect to its page's `form-action`, so the cart's pages let
  their forms go there.
- **Paid is learned by asking**: the thanks page retrieves the session,
  and a complete one whose payment is made (`paid`) or not needed
  (`no_payment_required`, a total of nothing, which a price of 0 makes)
  makes the order paid, with the email and the time, as Stripe's own
  guidance for fulfilling an order reads a session; complete and
  `unpaid` (a payment that takes days) is still open; an expired one,
  expired. A session says something of an order only when it is that
  order's own: its id, its reference, its amount and currency.
- **The cart loses what the order took, once**: when the thanks page
  finds the order settled and the cart marked with its checkout, the
  mark goes, and, the order paid, each product it took loses the
  quantity it took (`afterOrder`, `ShopRules.after_order`, held to the
  same cases); a line the checkout left out (its product gone or out of
  stock), a product put in since and more of one stay. A second visit, an
  old receipt opened again, or one opened in another browser, which holds
  no mark of it, changes nothing. No webhook: the CMS listens on 127.0.0.1, where
  Stripe cannot reach it. An order whose buyer paid and never came back
  stays open until the Orders screen asks Stripe again (`POST
  /api/orders/<id>/refresh`).
- **The API**: `GET` and `PUT /api/shop`, the settings and `checkout:
  {ready, reason}`; `GET /api/orders`, every order, the newest first, and
  `GET /api/orders/<id>`, never kept by a cache, as a form's responses
  are not; `POST /api/orders/<id>/refresh`, an open order asked again,
  any other answered as it is without asking (409 `checkout_not_set_up`
  when an open one cannot be asked about, 502 `stripe_failed` when Stripe
  could not be). [`cms/openapi.yaml`](../../cms/openapi.yaml) describes
  them, and the request tests hold every answer to it.
- **Both storages keep the shop**, behind the capability `shop`, held by
  the same battery ([storage-behind-an-adapter.md](storage-behind-an-adapter.md)).
  The browser's keeps the settings as a record of its site store, beside
  the style, and the orders in a store of their own, which the layout's
  fourth step adds, every record of the others kept. Its checkout, the
  demo's (`checkoutDemo`), makes the order as the CMS's does, from the
  cart's lines for sale at the prices the products published, of its own
  status, `demo`, which the editor says as "Not paid: browser demo": a
  page with no server behind it reaches no Stripe. It never calls one; an
  order of it is answered as it is when asked again.
- **A fake Stripe for the tests**
  ([`cms/test/support/fake_stripe.rb`](../../cms/test/support/fake_stripe.rb)),
  a Rack app on 127.0.0.1 answering the two calls as Stripe's API does,
  its JSON and its errors (a parameter missing, a session it never made,
  another key, a failure on demand), with what a test does to it (a
  session paid, expired) and a page that pays a session as Stripe's does.
  The CMS's tests run it in their own process; the editor's harness runs
  it as a process of its own and gives the CMS its address and key, so the
  battery checks out on the CMS through the cart's addresses, as a
  visitor's browser does.

## The editor

- **The Shop screen**, from the mark's menu after Collections, and the
  phone's More, where the storage keeps a shop and collections
  (`builder/src/editor/shop/`): built as the Collections screen is, the
  shop's two parts on its left, each with a line of what it holds, the
  one chosen on its right, one level at a time on a phone's window. Its
  settings: on or off, the currency, the products offered among the
  collections with a number field and their price among that
  collection's number fields (a newly chosen collection takes its field
  `price`, else its first number field); checked by the shop's rules
  before they are sent, each refusal said at its control in words of its
  keyword (`collectionExists`, `numberField`, `priceField`, `required`,
  `enum`, `type`), the storage's the same way; saved with their own
  button, apart from the page's history, the controls at hand while the
  save travels and a change made meanwhile kept as one not saved yet, a
  change not saved asked about before anything takes its place, and
  handed to the canvas once saved.
  Whether checkout reaches Stripe: the storage's reason, which names a
  variable and never what it holds, and one sentence of how to set it up
  on the CMS (a Stripe account in test mode, its test secret key in
  `STRIPE_SECRET_KEY` where the CMS runs), or in the browser what the
  full system does instead. Its orders: a table (when, status, total in
  the shop's words for an amount, items in words, the email once paid),
  an order whole in its place, its lines as they were sold, and Ask
  Stripe again for one still open, its 409 (`checkout_not_set_up`) and
  its 502 each said; with none yet, how an order comes.
- **The Collections screen** says the refusals the shop added: deleting
  the collection the shop sells from (409, `collection_in_shop`), and the
  price field taken away or given another type (`shopPrice`), at the
  list and under the field. A fourth preset, **Products**: a summary, an
  image, a body, `price` (a number from 0 to 100,000) and `in-stock`
  (the toggle the shop reads), listed by name.
- **Add to cart** (`addToCart`), a widget written twice, in React and as
  a Rails partial, with the button widget's markup and style keys, held
  by the render contract on seven fixtures with a shop (`shop*.json`): for
  a product, an entry of the collection the shop sells from while it is
  on, a form posting `entry` and `quantity` (optional, 1 to 20) to
  `/cart/items`, form-encoded with no token, the way the cart takes it;
  for one out of stock or with no price, those words where the button
  goes, and no button. For anything else (the shop off, another
  collection's entry, values made up with no entry, a page) its root is
  there, empty and hidden, and the canvas says why, faintly. Insert
  offers it only in the template of the collection the shop sells from
  while the shop is on, in This entry beside Field; the storage refuses
  it on a page and in the site's parts (keyword `addToCart`), as it
  refuses a Field block, and so does Paste. On the canvas the form is
  drawn as on the site and sends nothing; the demo draws it, and since
  its third phase puts the product in the cart the browser keeps (below,
  "The site").
- **Prices as money**, in the shop's currency, by the twins of the words
  for an amount (`moneyWords`, `money_words`), read by a renderer's twin
  of its own (`builder/src/render/shop-words.ts`, `ShopWords`): a Field
  block that draws the price field of the collection the shop sells
  from, and a Collection list's cards, by a `price` member naming a
  number field, as `image`, `date` and `excerpt` name theirs. With the
  shop off, or for another collection, a number is drawn as a number; a
  value no price can be (below zero, a third decimal) draws nothing
  where it would be a price. Values made up for a collection with no
  entry carry the collection's id, so a template's preview draws its
  price so too.
- **The keys of the pages that draw the shop**
  ([published-pages-cached-by-key.md](published-pages-cached-by-key.md)):
  a page that lists the collection the shop sells from, or is drawn with
  an entry of it, while the shop is on, is keyed on a digest of the
  settings, its ETag and its outer fragment, and so is a list's block of
  that collection; a Field block's and an Add to cart block's keys hold
  what they draw. Any other page draws as with no shop, and keeps its
  keys when the settings change. The settings are read in one query, and
  only by a page that lists a collection or is drawn with an entry.

## The site

- **The cart's pages are drawn in the site's frame, and are no
  document.** The cart, `/cart`, and the page Stripe sends a visitor back
  to, `/cart/thanks`, are the visitor's own and drawn at every visit, so no
  block can hold what they show; the CMS draws them with tag helpers
  ([`CartHelper`](../../cms/app/helpers/cart_helper.rb)) inside the
  site's header and footer, as the 404 page and a form's answer are drawn,
  with a block's own classes wherever a block would draw the same thing:
  a band of the site's Text slot, deep water in the example site, with
  the title in the headings' face at the Heading 1 step and a line under
  it, then the page's own band, its lines down the left and, beside them
  above a tablet's width and under them below it, a card of the Soft slot
  with the total and what comes next (site.css, "The cart's pages"). A
  line holds its product's picture, the collection's first image field
  drawn as a Field block draws one, its alt the entry's; its title, the
  link to the product's page while the collection's template is live
  ([`CartPage`](../../cms/app/models/cart_page.rb)); its price for one,
  what it costs, its quantity's form, Update a pill drawn as an outline
  in the band's words' colour, so Checkout is the band's one red, and
  Remove, plain words. A line that cannot be bought says why in bold, as a
  refused field does (out of stock, no price, no longer sold: "the
  checkout leaves it out"), and can only be taken out. An empty cart says
  so and leads to the shop, the page at the products' prefix. The page
  back from Stripe says, in plain words, paid ("Thank you"), not yet,
  expired, or not known just now, lists the order's lines as they were
  sold and its total, and leads back to the shop once paid, to the cart
  otherwise. No script: every control is a plain form posting to the
  cart's own addresses, and on a coarse pointer every control of the
  cart's band stands 44 pixels tall; nothing scrolls sideways at 320
  wide. Both are still `no-store` and `noindex`.
- **The demo draws the same cart, held to the CMS's.** The demo has no
  server, so it keeps the cart itself: in localStorage
  (`page-builder-cms:demo-cart`), as the CMS's cookie holds it, ids and
  quantities, read and changed by the shop's rules (`readCart`,
  `addToCart`, `setQuantity`, `afterOrder`), every read and write inside a
  try, so a browser that keeps nothing has an empty cart at each page.
  Add to cart, which on the CMS posts to `/cart/items`, puts the product
  in and opens the demo's cart (`?cart`), drawn by twins of the CMS's
  markup and words (`builder/src/demo/cart-view.tsx`, `cart-page.ts`):
  the cart's contract ([`contract/cart/`](../../contract/cart/)) has five
  pages, each priced by both sides' own twins of the rules and drawn, the
  CMS writing `<main>`'s content as goldens and the demo giving each
  golden's tree. Every change of the demo's cart starts from the cart as
  kept at that moment, never from what its tab drew, and is kept before
  anything else can run; a change made in another tab is drawn again
  (the `storage` event). Its Checkout makes the order through the
  browser's storage (`checkoutDemo`) of the cart as kept when it is
  pressed, "Not paid: browser demo", then the cart as kept once the order
  is made loses what the order took, and the order's page says what the
  full system does instead: Rails sends the visitor to Stripe's checkout,
  in its test mode. The Shop screen lists the order; in the browser it
  says Add to cart fills the cart this browser keeps, and that Stripe
  charging the currency is the full system's.
- **A whole checkout runs in Chromium.** The editor's browser tests give
  their CMS the tests' fake Stripe, as the battery's runs do, and let a
  page reach the fake's own origin: a visitor puts a product in from its
  page, changes how many, checks out to the fake's page for the session,
  puts another product in meanwhile, pays and comes back to the thanks
  page; the editor's Shop screen lists the order paid, with the email the
  buyer gave, and the cart holds only the line put in meanwhile
  (`builder/e2e/shop-checkout.spec.ts`).

## The example site

- **Slack Water sells its club kit.** A collection, Club kit, at the
  prefix `shop`, of the Products preset's fields, ordered by name: a swim
  cap (£12), a tow float (£24), the enamel mug (£9.50, out of stock, to
  show it) and a pass for five Sundays of the winter series (£25), each
  with one of the site's pictures and its alt words from `site.json`, in
  short words in the voice of its other pages. Its template, made of
  blocks and the Site style's tokens alone: a band of deep water with the
  picture beside the title, the price, the summary and Add to cart, the
  body on paper, then "More from the club shop", a Collection list of the
  same collection, two of the others with their prices on the pale sea. A
  page "Shop" at `/shop`, the prefix's own, lists the four in a grid with
  their prices under its title and a short lede, and leads to the cart;
  the footer's More pages menu links it, not the header, whose fold is
  measured for its own links.
- **Both seeds turn the shop on**, in pounds, selling Club kit by its
  price: `site.json` holds the settings as the API takes them, their
  collection named by its id there, and each seed, the CMS's and the
  demo's, sets them once the collections are made, naming the collection
  by the id it was made with, as a Collection list's collection is named,
  only while the site's settings were never changed (the site's home is
  set only while it has none), looked at and set in one transaction on
  the CMS. A collection at the prefix that the shop's rules refuse to sell
  from leaves the shop unset, the seed saying why. The demo's example site
  is a new edition.

## What it costs

- **A cookie at last, though on no page**: the cart's addresses set one,
  where until now no answer of the CMS did. It is the visitor's own and
  goes only to `/cart`; the published pages still carry none, and are
  cached as before.
- **Another pair of twins**: the shop's rules in two languages, held to
  one verdict by the cases both read, which must grow with every rule.
- **No webhook**: an order paid by a visitor who never comes back to the
  thanks page reads open until someone asks Stripe again, and its paid
  time is when the CMS learned it, not when the payment was taken; that
  visitor's cart keeps what they paid for until they open the thanks page,
  the only place that knows the cart's browser.
- **A session Stripe made but never answered in time is lost**: the order
  goes, nobody is sent to the session, and it expires unpaid at Stripe a
  day later.
- **What the shop names cannot be deleted while named, even with the shop
  off**: the collection and its price field wait for the settings to name
  another, or none.
- **The settings are not saved at a revision**: two tabs changing them at
  once keep the last, as the site style does.
- **The orders are read whole**, with no pages of results.
- **The checkout's count is a form's**: behind a front proxy on this
  machine the whole site shares ten checkouts in ten minutes.
- **Stripe's own limits are Stripe's to say**: a total below its minimum
  charge, or above its maximum, is refused there, and the cart says
  checkout could not start.
- **Three currencies, each of two decimals**: one with none or three would
  need its own count of the smallest unit.
- **The cart's pages draw the header and the footer anew** at every visit,
  outside the cache, being the visitor's own. They still carry the weak
  ETag Rack gives every answer, as the preview does; `no-store` keeps any
  browser from holding it, so none sends it back.
- **The fake is only as faithful as Stripe's documentation**: no test
  reaches Stripe, and a key of the test mode must be tried by hand.
- **Add to cart needs a product to draw**: in a template whose collection
  has no entry yet, drawn with made-up values, it draws nothing, and the
  canvas says so until an entry is written.
- **A value no price can be draws nothing where a price would be**: a
  number below zero in the price field shows no number, where the same
  field of another collection would show it.
- **One query more** for every page that lists a collection or is drawn
  with an entry, a 304 included: the shop's settings, to know whether the
  page draws them.
- **A page that lists the products is drawn again at every change of the
  settings**, even when its list shows no price.
- **Add to cart's words where its button goes are the site's own**, Out of
  stock and Not for sale, in English as the cart's pages are.
- **The cart's pages are drawn twice**, by the CMS and by the demo, and
  the goldens of the cart's contract must be written again whenever the
  CMS's change.
- **The cart's pages are no document**: their look is the theme's, in the
  Site style's slots and steps, and a site owner changes it through the
  Site style and the site's custom CSS, never with blocks in the editor.
- **The demo's cart is one browser's**, as its pages are: another browser
  sees none of it, a browser that keeps nothing in localStorage loses it
  at each page, and a demo's order is final: the cart loses what it took,
  though nothing was paid.
- **The editor's browser tests always have a Stripe**, the fake: the
  Shop screen's words for a checkout not set up are held by the unit
  tests and the CMS's own, no longer in Chromium.
- **The example site's seed turns the shop on**: the browser tests of a
  run share one CMS, so each test that changes the shop sets the settings
  it needs and puts them back as it found them, and the list of orders is
  not empty in a run that checked out before it.
- **The footer's More pages menu holds four links**, and on a phone it
  folds into Menu, where three still fitted.

## The proof

From `builder/`, `npm test` (1367 tests in 170 files, none failing, on 16
October 2026) holds the TypeScript twin to the shared cases
(`src/shared/shop.test.ts`), the adapter's types and the Rails adapter's
routes to `cms/openapi.yaml` (`src/storage/openapi.test.ts`, 63 shapes
and the shop's lists), the Rails adapter's requests and refusals
(`src/storage/rails.test.ts`) and the browser's words to the CMS's Ruby
(`src/storage/browser-rules.test.ts`). From `cms/`, `ruby bin/rails test
test/models/shop_rules_test.rb` holds the Ruby twin to the same cases.
Planted one at a time, each of these faults turned its test red, in the
twin of each side: a shop on with no collection let through, a price
counted by a float's integer part, a product's second line kept in a cart,
a product with no toggle value counted in stock, no comma between
thousands, a total of every line, a fourth currency, a paid order's
lines taken whole from the cart; and an order's
`email` made optional in `openapi.yaml`, the refresh's route moved, `cart`
left out of the browser's reserved addresses, a word of the shop changed,
a change of the settings sent without its price, its refusal thrown.

From `cms/`, `ruby bin/rails test` (591 runs, none failing, on 16 October
2026) holds the shop's API (`test/integration/api/shop_test.rb`,
`orders_test.rb`), the cart's addresses
(`test/integration/cart_test.rb`, against the fake Stripe), the client and
the settings (`test/models/stripe_client_test.rb`), and every answer of
the API to `openapi.yaml` (519 answers). Planted one at a time, each of
these faults failed them: the cookie not HttpOnly nor Lax, prices read
from a draft, the `Origin` not checked, the checkout not counted, a token
wanted of the cart's writes, a shop that is off still selling, the
shop's collection deleted, its price field taken away, a live key taken,
Stripe's own address taken in the tests, the key in the log, Stripe's
words not scrubbed, an order kept after Stripe refused it, any session
settling any order, the cart's forms held to its own origin, the cart
emptied at every visit of a paid order's thanks page (as first written,
before review), the checkout's mark dropped by a change of the cart, a
visit that holds no mark taking from the cart, the mark kept once
settled, a free order left open (paid alone settling an order), paid
without complete, unpaid settling, a paid order asked again, `cart` not
reserved, an email of any length kept, the settings read
through the JSON rules first, a body of any size or encoding, an unchanged
change given a new time, lists encoded flat, the key in `inspect` or in
the address, a session's page on another origin followed, an integral
float refused as an id. `ruby bin/rubocop` and `ruby bin/brakeman -q`
found nothing.

From `builder/`, `npm run test:rails` (107 tests) runs the battery's four
cases of the shop on the CMS's adapter, checking out through the cart's
addresses to the fake Stripe; and `npm run e2e:browser` (104 passed, 7
skipped) on the browser's, in Chromium on its IndexedDB, with the
upgrade of a database the build before the shop kept, every record as it
was, the site standing as it stood, the build before's tab told to
reload; a new database's shop, off; and the demo's checkout, which orders
the lines for sale at their published prices and leaves the others out.
Planted in the browser's adapter, each failed: its settings let through
unchecked, the shop's collection deleted, its price field taken away,
the orders oldest first, an order changed when asked again, the demo's
checkout priced from drafts, the orders' store counted in how the site
stands while empty, an upgrade that loses the entries, a new shop on; and
in the CMS, the battery's cases failed with the settings unchecked, the
shop's collection deleted, the orders oldest first and an order asked
again but not kept.

For the editor's screen, Add to cart and the prices, from `builder/`,
`npm test` (1429 tests in 177 files, none failing, on 16 October 2026)
holds the renderer's twin of the shop's words
(`src/render/shop-words.test.ts`), the prices a Field block and a list's
cards draw (`src/widgets/field/drawing.test.ts`,
`src/widgets/collectionList/cards.test.ts`), what Add to cart draws, its
panel, Insert and Paste (`src/widgets/addToCart/`), the Shop screen and
its words (`src/editor/shop/`), the Products preset and the Collections
screen's refusals, the shell's reads of the settings, the demo's Add to
cart (`src/demo/PageView.cart.test.tsx`), the icons to their Lucide
files, and the render contract on its seven fixtures with a shop, React
against the server's goldens and the safety check. Planted one at a time,
each of these faults turned its test red: the shop off still selling, a
Field block's price and a card's drawn as numbers, no price said as out of
stock, Add to cart offered in any template, the canvas's words for a shop
that is off lost, a currency refused in the schema's words, Ask Stripe
again offered for a paid order, the preset's price stopping at 10,000, the
refusals of the collection the shop sells from and of its price lost, a
storage with no shop asked for one, the demo's line under an Add to cart
that has no form, a change made while a save travelled undone by its
answer, the shop's icon and the cart's off their files by one number, the
React cart's form sent by GET, and to another site; Add to cart let into
a part, its rule's words other than the server's, offered on a page, and
out of This entry.

From `cms/`, `ruby bin/rails test` (611 runs, none failing) holds the
Ruby twin (`test/models/shop_words_test.rb`), the partials
(`test/views/blocks_test.rb`), the goldens, and what a visitor is served
(`test/integration/shop_pages_test.rb`): a product's page, its price as
money and Add to cart a form the cart takes as the page sends it; the
shop off; Add to cart refused on a page and in the header; a template's
preview on made-up values; the ETags and the fragments at a change of the
settings. Planted, each failed: the Rails cart's form sent by GET, the
shop off still selling, a page listing the products not keyed on the
settings, a price's block not keyed on them, every page that lists a
collection keyed on them, Add to cart let onto a page; and Add to cart's
words let past 80 characters in the schema (`npm run compare`).

In Chromium, `npm run e2e` (`e2e/shop.spec.ts`: the Products preset, the
Shop screen on the CMS, Add to cart in the template, a visitor's cart,
the shop turned off) failed with the visitor's quantity left out of the
form, and the widgets' own test of Add to cart (`e2e/widgets.spec.ts`)
with its quantity left without a label; `npm run e2e:browser` (106
passed, 7 skipped) with the browser's checkout said in other words, and
with Add to cart let onto a page of the browser's storage; `npm run
e2e:demo` (14 passed) holds the demo's Shop screen to promising nothing
the browser cannot do, and failed with its orders' words naming a
visitor but not the full system; `npm run check:serving` (`RESULT: 105
checks passed`) failed with a page listing the products, then a
product's page, not keyed on the settings: each old ETag got a 304, in
the old currency. `npm run test:rails` (108 tests) draws every widget a
page holds on the CMS as in React, Add to cart left out with the Field
block: the CMS refuses both on a page.

For the site and the example site, on 16 October 2026. From `cms/`,
`ruby bin/rails test` (623 runs, none failing) holds the cart's pages
(`test/integration/cart_test.rb`: each line's picture with its entry's
alt, its title a link while the template is live, the field and the
buttons naming the product, the count of items, a line that cannot be
bought saying why, the empty cart leading to the shop, a cart refused
before it was read leading back to it, the thanks page's lines as they
were sold, its total and its way back), the cart's contract's server half
(`test/contract/cart_goldens_test.rb`, five pages) and the seed
(`test/integration/seed_test.rb`: the shop on, in pounds, selling Club
kit by the id it was made with, set once and left off when turned off,
a collection at the prefix with no price left unsold). Planted one at a
time, each failed: no picture drawn, a title linked while the template
is not live, the items counted as lines, a field naming no product, the
order's lines not drawn, a paid order leading back to the cart, a cart
refused with no way back, a line's words changed on the CMS's side alone,
a picture drawn with no alt; the seed setting no shop, setting it again
once changed, naming the collection by `site.json`'s id, reading the
settings unchecked, stopping at a collection the rules refuse; the shop's
page listing no prices, the mug in stock, the footer not leading to the
shop. `ruby bin/rubocop` and `ruby bin/brakeman -q` found nothing.

From `builder/`, `npm test` (1449 tests in 178 files, none failing) holds
the cart's contract's demo half (`src/demo/cart.contract.test.tsx`), the
demo's cart (`src/demo/PageView.cart.test.tsx`), its addresses
(`views.test.ts`), the demo's seed of the shop's settings
(`src/storage/example-site.test.ts`) and the Shop screen's words in the
browser (`src/editor/shop/words.test.ts`). Planted, each failed: the
demo's price for one in other words, a line without its state, titles
linked while the template is not live, a refused state in other words;
Add to cart keeping nothing, a product out of stock put in, the checkout
keeping the whole cart, no refusal said above the cart, the order's page
without what the full system does; a change of the cart made to what the
tab drew, which undid another tab's (as first written, before review),
the order taken from the cart as drawn, another tab's change not drawn
again; the demo's seed setting no shop, setting it again once changed,
naming the collection by `site.json`'s id, reading the settings
unchecked, letting a member through that the shop does not take; the
switch and the currency said in the browser as on the CMS. `npm run
test:rails` (109 tests) draws the example site's five pages and each of
its nine entries' pages on the CMS as in React, the shop's among them;
`npm run e2e:browser`: 106 passed, 7 skipped.

In Chromium, `npm run e2e` (302 passed) runs the whole checkout
(`e2e/shop-checkout.spec.ts`) and the example site's cart and thanks pages
with axe, at 320 and for a finger (`e2e/example-site.spec.ts`). Planted,
each failed: the cart's pills under 44 pixels, a line's title and the way
back to the shop under 44 pixels for a finger, and before it was given
its height, the quantity's field at 43 pixels on a phone; the thanks page
keeping what was paid for in the cart, and never asking Stripe whether
the order is paid. `npm run e2e:demo` (15 passed) tells the demo's cart and
order with the Shop screen's Orders, and failed with a link to `/cart`
not followed; its check that the screens promise nothing the browser
cannot do failed, as first built, on the Shop screen's switch saying a
visitor's cart in the browser. `npm run check:serving` (`RESULT: 107
checks passed`) holds `/cart` to the site's frame, never stored, for no
search engine, with no script and no cookie set by reading it, and failed
with the cart's `no-store` taken out. At the root, `npm run
measure:server` (`RESULT: 38 checks passed`) finds a cold visit writing
514 fragments, one more than before for the footer's link to the shop.
