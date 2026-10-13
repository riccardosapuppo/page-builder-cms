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

    # Any other address or method under /api/: the API's JSON 404, not the
    # site's HTML 404 page.
    match "*path", to: "missing#show", via: :all
  end

  # The pages a visitor sees. The draft preview first, then / for the home
  # page and /<slug> for the others: a slug is lowercase ASCII words joined
  # by single hyphens (Slug::FORMAT), so it never takes a format suffix and
  # never shadows /up, /api, /assets or /rails, which Slug reserves.
  get "preview/:page_id", to: "previews#show", constraints: { page_id: /[0-9]+/ }, format: false
  # The stylesheet of a page's free colours: a page's address never has a
  # dot, so it is no page.
  get "colors.css", to: "free_colors#show", format: false
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
end
