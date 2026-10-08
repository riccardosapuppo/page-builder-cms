# frozen_string_literal: true

# A form sent from a published page, which posts to the page's own address
# (app/views/blocks/_form.html.erb), the confirmation it leads to, and the
# answer to a form sent from the draft preview.
#
# No CSRF token. Rails keeps its token in the session, and a published
# page is cached and shared: it has no session, carries no token and sets
# no cookie (PublicPage). So token-based protection is skipped here, said
# by skip_forgery_protection below, and on the same route three guards
# take its place:
# - the Origin header, which a browser sets on every form it posts: a form
#   sent from another site, or with no Origin at all, is refused with 403
#   and nothing is read or counted;
# - rate_limit: at most LIMIT forms in WINDOW from one address, the
#   socket's own peer and no header's word for it
#   (config.x.submission_limit_by, which says why), counted in a store
#   named for it (config.x.submission_limit_store, which says why too);
#   beyond, 429 with Retry-After. Every form past the Origin counts, those
#   refused below included;
# - the field for robots ("website", never drawn): filled in, the form is
#   answered as if its answers were kept, and nothing is kept.
# Then the sizes: only a form's own encoding (415), a body no larger than
# the largest form sends (413), and each answer within its field's limit
# (FormAnswers, 422 with the page drawn again).
#
# Every answer here, the confirmation included, is Cache-Control: no-store
# and noindex: each is about one visitor's form. None sets a cookie.
class SubmissionsController < ApplicationController
  include PublicPage

  LIMIT = 10
  WINDOW = 10.minutes
  LIMIT_STORE = ActiveSupport::Cache.lookup_store(Rails.configuration.x.submission_limit_store)

  # The longest body a browser sends for the largest form the schema
  # allows: every field (FormBlock::MOST_FIELDS) at the longest limit, each
  # character four bytes of UTF-8 sent as three-character %XX escapes (12
  # bytes), with one character more, so that a field over its own limit
  # still reaches that field's check and its message; then the field's
  # name around it (at most 64 bytes) and 1 KB for the rest (the form's id,
  # the field for robots). About 1.2 MB.
  MAX_BODY = FormBlock::MOST_FIELDS * (((FormBlock::LONGEST.values.max + 1) * 12) + 64) + 1024

  NOT_READ = "The form could not be read, so nothing was kept. Go back to the page and send it again."

  skip_forgery_protection

  # In this order: a form refused for its Origin is refused before the
  # count, so it neither counts nor writes to the count's store, and a page
  # of another site cannot use up the count that every visitor behind one
  # address shares (config.x.submission_limit_by says when they share it).
  # Every form past the Origin counts, refused or kept.
  before_action :keep_out_of_caches
  before_action :same_origin_only, only: :create
  rate_limit to: LIMIT, within: WINDOW, by: -> { Rails.configuration.x.submission_limit_by.call(request) }, store: LIMIT_STORE, with: :too_many, only: :create
  before_action :form_encoded_only, :within_size, only: :create

  # POST / and POST /:slug
  def create
    page = live_page
    return render_not_found unless page

    form_id = params[:form]
    return refuse(:bad_request, NOT_READ) unless form_id.is_a?(String)

    version = page.published_version
    document = BlockDocument::Upgrade.call(version.document)
    form = FormBlock.find(document, form_id)
    return refuse(:conflict, "This form is no longer on the page, so nothing was kept. Go back to the page to see it as it is now.") unless form

    # A robot's: answered as a person's would be, so it learns nothing. The
    # page sends the field empty; anything else, a list or a hash even when
    # empty, comes from a client that does not use the page.
    trap = params[:website]
    unless trap.nil? || trap == ""
      logger.info "form #{form.id} of page #{page.id}: the field for robots was filled in, nothing kept"
      return redirect_to(sent_address(page, form), status: :see_other)
    end

    answers = FormAnswers.new(form.fields, raw_answers)
    return draw_again(document, form, answers) unless answers.valid?

    submission = Submission.record!(page: page, version: version, form: form, answers: answers)
    logger.info "form #{form.id} of page #{page.id}: answers kept as submission #{submission.id}"
    redirect_to sent_address(page, form), status: :see_other
  rescue FormAnswers::Unreadable => e
    logger.info "form of page #{page&.id}: #{e.message}"
    refuse(:bad_request, NOT_READ)
  end

  # GET /sent/:form (the home page's form) and GET /:slug/sent/:form: what
  # the form says once its answers are kept, with a link back to the page.
  def show
    slug = request.path_parameters[:slug]
    page = slug ? Page.find_by(slug: slug.to_s, home: false) : Page.home_page
    page = nil unless page&.published?
    document = page && BlockDocument::Upgrade.call(page.published_version.document)
    form = document && FormBlock.find(document, request.path_parameters[:form].to_s)
    return render_not_found unless form

    lines = form.confirmation.split("\n")
    lines = [ "Your answers were sent." ] if lines.empty?
    render_document(notice("Form sent", lines, back: page.live_path, page_title: document["title"]), title: "Form sent: #{document['title']}")
  end

  # POST /preview/:page_id: the preview draws the draft's forms, which post
  # to the preview's own address; nothing from a draft is kept.
  def preview
    refuse(:forbidden, "Forms are sent from the published page. Nothing sent from this preview was kept.", heading: "Not sent from a preview")
  end

  private

  def keep_out_of_caches
    no_store
    @noindex = true
    response.headers["X-Robots-Tag"] = "noindex"
  end

  # The page whose form was sent: the home page at /, the page at /<slug>,
  # or the page an older address of it now leads to; published, or nil.
  def live_page
    slug = request.path_parameters[:slug]&.to_s
    page = slug ? Page.find_by(slug: slug) : Page.home_page
    page ||= SlugRedirect.includes(:page).find_by(from_slug: slug)&.page if slug
    page if page&.published?
  end

  def raw_answers
    raw = params[:answers]
    raw.is_a?(ActionController::Parameters) ? raw.to_unsafe_h : raw
  end

  # / for the home page, /<slug> for another, then sent/<form id>.
  def sent_address(page, form)
    "#{page.live_path.delete_suffix('/')}/sent/#{ERB::Util.url_encode(form.id)}"
  end

  def same_origin_only
    return if request.origin.present? && request.origin == request.base_url

    logger.info "form refused: Origin #{request.origin.inspect}, not #{request.base_url}"
    refuse(:forbidden, "This form did not come from this site's own page, so it was not kept. Send it from the page itself.")
  end

  def form_encoded_only
    return if request.media_type == "application/x-www-form-urlencoded"

    refuse(:unsupported_media_type, NOT_READ)
  end

  # Read from the header, never from the body: Rails' content_length would
  # read the whole body to count it when a Transfer-Encoding is named.
  # Puma has read the body by now and named its length.
  def within_size
    return if request.get_header("CONTENT_LENGTH").to_i <= MAX_BODY

    refuse(:content_too_large, "The answers were too long to send, so nothing was kept. Go back to the page, shorten them and send them again.")
  end

  def too_many
    response.headers["Retry-After"] = WINDOW.to_i.to_s
    refuse(:too_many_requests, "Too many forms were sent from your connection in a short time, so this one was not kept. Wait ten minutes, then send it again.")
  end

  # The page as the visitor sent it, with what they wrote and, by each
  # field refused, why; above the page, the same list with links to the
  # fields. Never cached (BlocksHelper#render_blocks refuses to).
  def draw_again(document, form, answers)
    @answers = { form.id => { "values" => answers.values, "errors" => answers.errors } }
    @form_errors = form.fields.filter_map do |field|
      { id: "#{form.id}:#{field.name}", label: field.label, message: answers.errors[field.name] } if answers.errors.key?(field.name)
    end
    render_document(document, status: :unprocessable_content, title: "Error: #{document['title']}")
  end

  def refuse(status, text, heading: "Not sent")
    render_document(notice(heading, [ text ], back: request.path), status: status, title: heading)
  end

  # A short page in the site's look, a document drawn through the same
  # partials as the 404 page (PublicPage::NOT_FOUND): a heading, the lines
  # of text, and a link back to the page the form was on.
  def notice(heading, lines, back:, page_title: nil)
    text = ->(id, content, style = {}) { { "id" => id, "type" => "text", "props" => { "doc" => { "type" => "doc", "content" => content } }, "style" => { "base" => style }, "children" => [] } }
    said = lines.each_with_index.flat_map { |line, i| [ ({ "type" => "hardBreak" } if i.positive?), ({ "type" => "text", "text" => line } unless line.empty?) ].compact }
    link = { "type" => "text", "text" => page_title.present? ? "Back to #{page_title}" : "Back to the page", "marks" => [ { "type" => "link", "attrs" => { "href" => back } } ] }
    widgets = [
      { "id" => "notice-heading", "type" => "heading", "props" => { "level" => 1, "text" => heading }, "style" => { "base" => {} }, "children" => [] },
      text.call("notice-text", [ { "type" => "paragraph", "content" => said } ], { "textSize" => "large" }),
      text.call("notice-back", [ { "type" => "paragraph", "content" => [ link ] } ])
    ]
    {
      "schemaVersion" => 1, "title" => heading,
      "sections" => [ {
        "id" => "notice", "type" => "section", "props" => {}, "style" => { "base" => { "spaceAbove" => "section-l", "spaceBelow" => "section-l" } },
        "children" => [ { "id" => "notice-column", "type" => "column", "props" => {}, "style" => { "base" => {} }, "children" => widgets } ]
      } ]
    }
  end
end
