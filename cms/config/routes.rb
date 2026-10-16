Rails.application.routes.draw do
  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check

  # The JSON API of the editor, described by cms/openapi.yaml. Every route
  # is written out, so this list and the document can be read side by side.
  # No format suffix: /api/pages/1.json is not an address.
  scope "api", module: "api", as: "api", format: false do
    get "pages", to: "pages#index"
    post "pages", to: "pages#create"
    get "pages/:id", to: "pages#show"
    patch "pages/:id", to: "pages#update"

    get "pages/:id/draft", to: "drafts#show"
    put "pages/:id/draft", to: "drafts#update"

    post "pages/:id/publish", to: "publications#create"

    get "pages/:id/schedules", to: "schedules#index"
    post "pages/:id/schedules", to: "schedules#create"
    post "pages/:id/schedules/:schedule_id/cancel", to: "schedules#cancel"

    get "pages/:id/versions", to: "versions#index"
    post "pages/:id/versions", to: "versions#create"
    get "pages/:id/versions/:number", to: "versions#show"
    post "pages/:id/versions/:number/restore", to: "versions#restore"

    get "pages/:id/responses", to: "responses#index"
    get "pages/:id/responses/:response_id", to: "responses#show"
    delete "pages/:id/responses/:response_id", to: "responses#destroy"

    post "media/direct_uploads", to: "direct_uploads#create"
    get "media", to: "media#index"
    post "media", to: "media#create"
    patch "media/:id", to: "media#update"
    delete "media/:id", to: "media#destroy"

    get "site-style", to: "site_styles#show"
    put "site-style", to: "site_styles#update"

    get "site", to: "sites#show"

    get "collections", to: "collections#index"
    post "collections", to: "collections#create"
    get "collections/:id", to: "collections#show"
    patch "collections/:id", to: "collections#update"
    delete "collections/:id", to: "collections#destroy"

    get "collections/:id/entries", to: "entries#index"
    post "collections/:id/entries", to: "entries#create"
    get "collections/:id/entries/:entry_id", to: "entries#show"
    put "collections/:id/entries/:entry_id", to: "entries#update"
    delete "collections/:id/entries/:entry_id", to: "entries#destroy"
    post "collections/:id/entries/:entry_id/publish", to: "entries#publish"
    post "collections/:id/entries/:entry_id/unpublish", to: "entries#unpublish"

    get "shop", to: "shops#show"
    put "shop", to: "shops#update"

    get "orders", to: "orders#index"
    get "orders/:id", to: "orders#show"
    post "orders/:id/refresh", to: "orders#refresh"

    # Any other address or method under /api/: the API's JSON 404, not the
    # site's HTML 404 page.
    match "*path", to: "missing#show", via: :all
  end

  # The pages a visitor sees. The draft preview first, then / for the home
  # page and /<slug> for the others: a slug is lowercase ASCII words joined
  # by single hyphens (Slug::FORMAT), so it never takes a format suffix and
  # never shadows /up, /api, /assets or /rails, which Slug reserves.
  get "preview/:page_id", to: "previews#show", constraints: { page_id: /[0-9]+/ }, format: false
  # The stylesheet of a page's free colours, by its digest: a page's
  # address never has a slash or a dot, so it is no page.
  get "colors/:digest.css", to: "free_colors#show", constraints: { digest: /[0-9a-f]{64}/ }, format: false
  # The stylesheet of a page's free type, by its digest, the same way.
  get "type/:digest.css", to: "free_type#show", constraints: { digest: /[0-9a-f]{64}/ }, format: false
  # The site's own stylesheet, the version its address names.
  get "custom.css", to: "custom_css#show", format: false

  # The shop's cart (CartController): the cart, a product put in, a line's
  # quantity set (0 takes it out), the checkout that sends the visitor to
  # Stripe, and the thanks page Stripe sends them back to. They match only
  # while the shop is open (ShopSetting.open?, read at each request, by a
  # lambda so that it names the class reloaded in development); with the
  # shop off, /cart and the addresses below it fall through to the pages'
  # and the entries' routes below, as before the shop: a page a site had
  # at /cart before cart was reserved, a collection at the prefix cart, or
  # the 404 page. The shop is not turned on while a page or a collection
  # holds cart (ShopSetting), and cart is reserved for a new page's
  # address and a new prefix (Slug::RESERVED), so while these answer,
  # neither a page nor an entry is at one of them.
  constraints(->(_request) { ShopSetting.open? }) do
    get "cart", to: "cart#show", format: false
    post "cart/items", to: "cart#add", format: false
    post "cart/items/:entry_id", to: "cart#set", constraints: { entry_id: /[0-9]{1,18}/ }, format: false
    post "cart/checkout", to: "cart#checkout", format: false
    get "cart/thanks", to: "cart#thanks", format: false
  end

  root "pages#home"
  get ":slug", to: "pages#show", constraints: { slug: /[a-z0-9]+(?:-[a-z0-9]+)*/ }, format: false, as: :published_page

  # A page's forms post to the page's own address (SubmissionsController),
  # the preview's to the preview's. Once kept, the answers lead to
  # <page address>/sent/<form block id>: two or three segments, so no
  # confirmation ever shadows a page, and no slug needs reserving.
  post "/", to: "submissions#create", format: false
  post ":slug", to: "submissions#create", constraints: { slug: /[a-z0-9]+(?:-[a-z0-9]+)*/ }, format: false
  post "preview/:page_id", to: "submissions#preview", constraints: { page_id: /[0-9]+/ }, format: false
  get "sent/:form", to: "submissions#show", constraints: { form: /[A-Za-z0-9_-]{1,64}/ }, format: false
  get ":slug/sent/:form", to: "submissions#show", constraints: { slug: /[a-z0-9]+(?:-[a-z0-9]+)*/, form: /[A-Za-z0-9_-]{1,64}/ }, format: false

  # The page of an entry of a collection: /<prefix>/<entry slug>, two parts
  # in a slug's form, last, after every address of two parts the
  # application answers itself (a form's confirmation, /sent/<form>, the
  # preview, /preview/<id>), whose first part no collection may take as
  # its prefix (Collection::RESERVED_PREFIXES, Slug::RESERVED). A page's
  # address is one part; a collection's prefix is never one (Collection).
  get ":prefix/:slug", to: "entry_pages#show", constraints: { prefix: /[a-z0-9]+(?:-[a-z0-9]+)*/, slug: /[a-z0-9]+(?:-[a-z0-9]+)*/ }, format: false, as: :entry_page
end
