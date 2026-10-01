# frozen_string_literal: true

require_relative "document_builder"

# The example site of the approved design, Slack Water, an invented swimming
# club: the home page drawn in design/index.html#page, a content page, and
# a page that breaks the usual assumptions (four columns, a word too long
# for its line, emoji, nested lists, a long alt text, a dark section, a
# block hidden on phones).
#
# Images go into the media library the way an upload does: a blob on the
# storage service, then MediaItem.create_from_upload!, which checks the
# bytes as it checks the editor's uploads. The files are PNGs that
# tools/seed-images.ts renders from the design's SVGs.
#
# Running it again changes nothing: an image whose file is already in the
# library is reused, and a page is saved and published only when its
# document differs from what is there.
module ExampleSite
  extend DocumentBuilder

  IMAGES = Rails.root.join("db", "seed_images")

  # An invented video id: the provider answers that the video does not
  # exist, which is the truth about a demo site. The map point is an
  # arbitrary stretch of coast.
  VIDEO_ID = "dawn-swim01"
  MAP_POINT = [ 57.3009, -1.9497, 15 ].freeze

  module_function

  def run
    media = {
      hero: upload("hero-dawn", "The bay at dawn at slack water, with a line of buoys and three swimmers"),
      horizon: upload("g-horizon", "A flat horizon at first light"),
      caps: upload("g-caps", "Three swim caps at the waterline"),
      buoys: upload("g-buoys", "The buoy line across the bay"),
      slipway: upload("g-slipway", "The slipway running into the water"),
      rockpools: upload("g-rockpools", "Rock pools at low water"),
      wake: upload("g-wake", "A swimmer’s wake on still water"),
      tea: upload("m-tea", "A flask and two cups of tea on a rock after a swim"),
      winter: upload("m-winter", "The jetty in winter")
    }
    home = put_page("home", home_page(media))
    home.make_home! unless home.home?
    put_page("winter-series", winter_page(media))
    put_page("notices", notices_page(media))
    report
  end

  # The library item for a seed image: found by its file name and size if
  # an earlier run uploaded it, otherwise uploaded now.
  def upload(name, alt)
    path = IMAGES.join("#{name}.png")
    bytes = path.binread
    existing = MediaItem.joins(file_attachment: :blob)
                        .find_by(active_storage_blobs: { filename: path.basename.to_s, byte_size: bytes.bytesize })
    return existing if existing

    width, height = bytes.byteslice(16, 8).unpack("NN")
    blob = ActiveStorage::Blob.create_and_upload!(io: StringIO.new(bytes), filename: path.basename.to_s, content_type: "image/png", identify: false)
    MediaItem.create_from_upload!(signed_blob_id: blob.signed_id, width: width, height: height, alt: alt)
  end

  # The page at slug with this document as its draft and its live version.
  def put_page(slug, document)
    page = Page.find_by(slug: slug) || Draft.find_by(slug: slug)&.page || Page.create_with_draft!(title: document["title"], slug: slug)
    draft = page.draft
    if draft.document != document
      draft = Draft.save_document!(page_id: page.id, revision: draft.revision, document: document, save_id: "seed-#{draft.revision + 1}")
    end
    page.publish! if page.published_version&.document != draft.document
    page.reload
  end

  def report
    Page.includes(:draft, :published_version).order(:id).each do |page|
      puts format("  %-28s %-16s version %d%s", page.draft.document["title"], page.live_path, page.published_version.number, page.home? ? ", home" : "")
    end
    puts "  #{MediaItem.count} images in the media library"
  end

  def home_page(m)
    document(
      title: "Slack Water",
      description: "Dawn swims, beginners’ courses and a winter series, timed to the one quiet hour the tide gives us.",
      sections: [
        section("hero", [
          column("hero-1", [
            heading("hero-heading", "Swim at slack water", level: 1, base: { textSize: "display" }),
            text("hero-text", "Dawn swims, beginners’ courses and a winter series, timed to the one quiet hour the tide gives us.", base: { textSize: "large" }),
            button("hero-button", "Join a trial swim", "#join")
          ], base: { verticalAlign: "middle" }, tablet: { spaceInside: "l" }),
          column("hero-2", [
            image("hero-image", m[:hero], alt: "The bay at dawn at slack water, with a line of buoys and three swimmers")
          ])
        ], anchor: "top", label: "Hero", base: { spaceAbove: "section-s", spaceBelow: "section-s", spaceBetween: "xl" }),

        section("swims", [
          column("swims-1", [ iconbox("swims-dawn", "sunrise", "Dawn swims", "Twice a week, at first light, when the bay is flat.") ]),
          column("swims-2", [ iconbox("swims-course", "buoys", "Beginners’ course", "Four sessions from the shallows to the buoy line.") ]),
          column("swims-3", [ iconbox("swims-winter", "cup", "Winter series", "Short, cold, and followed by very hot tea.") ])
        ], anchor: "swims", label: "What we do", base: { background: "soft", spaceAbove: "section-s", spaceBelow: "section-s", spaceBetween: "xl" }),

        section("gallery", [
          column("gallery-1", [
            heading("gallery-heading", "From the water"),
            gallery("gallery-images", [
              [ m[:horizon], "A flat horizon at first light" ],
              [ m[:caps], "Three swim caps at the waterline" ],
              [ m[:buoys], "The buoy line across the bay" ],
              [ m[:slipway], "The slipway running into the water" ],
              [ m[:rockpools], "Rock pools at low water" ],
              [ m[:wake], "A swimmer’s wake on still water" ]
            ])
          ])
        ], anchor: "gallery", label: "Gallery"),

        section("meet", [
          column("meet-1", [
            heading("meet-heading", "See the bay before you join"),
            video("meet-video", "youtube", VIDEO_ID, "Watch a dawn swim")
          ], base: { verticalAlign: "bottom" }),
          column("meet-2", [
            text("meet-text", "We meet twenty minutes before slack water, whatever the clock says. Bring a bright cap, goggles and something warm for afterwards."),
            map("meet-map", *MAP_POINT, "Meeting point: the slipway at the north end of the beach")
          ], base: { verticalAlign: "bottom" })
        ], anchor: "meet", label: "See the bay", base: { spaceAbove: "section-s", spaceBelow: "section-s" }),

        section("quote", [
          column("quote-1", [
            quote("quote-text", "I came for the cold water and stayed for the tea.", attribution: "A member since last winter")
          ], base: { verticalAlign: "middle" }),
          column("quote-2", [ image("quote-image", m[:tea], alt: "A flask and two cups of tea on a rock after a swim") ])
        ], label: "Quote", base: { background: "soft" }),

        section("questions", [
          column("questions-1", [
            heading("questions-heading", "Before your first swim"),
            text("questions-text", [ "Ask us anything at the slipway, or ", link("send a request below", "#join"), " and we will answer by email." ])
          ]),
          column("questions-2", [
            accordion("questions-list", [
              [ "How cold is it?", "Between 8 and 18 degrees depending on the month. We shorten swims in winter." ],
              [ "Do I need a wetsuit?", "No. Many members swim without one; the course covers both." ],
              [ "What if the sea is rough?", "We cancel by 6 am and post it on this page." ]
            ])
          ])
        ], anchor: "questions", label: "Questions"),

        section("join", [
          column("join-1", [
            heading("join-heading", "Join a trial swim"),
            text("join-text", "Tell us a little about your swimming. We reply within two days with the next trial date and what to bring."),
            button("join-button", "Write to the club", "mailto:join@slackwater.example", base: { background: "primary", color: "background" })
          ])
        ], anchor: "join", label: "Join", base: { spaceAbove: "section-l", spaceBelow: "section-l" })
      ]
    )
  end

  def winter_page(m)
    document(
      title: "Winter series",
      description: "Short, cold swims from November to March, and very hot tea after every one.",
      sections: [
        section("intro", [
          column("intro-1", [
            heading("intro-heading", "Winter series", level: 1),
            text("intro-text", "Short, cold swims from the first Sunday of November to the last of March, and very hot tea after every one.", base: { textSize: "large" })
          ])
        ], base: { spaceAbove: "section-s", spaceBelow: "section-s" }),

        section("details", [
          column("details-1", [
            text("details-text",
                 "The sea is at its clearest in winter, and at its coldest. We keep swims short and stay close to the shore.",
                 [ bold("What to bring:") ],
                 bullets("A bright cap, so we can count heads", "Goggles", "Something warm, and dry, for afterwards"),
                 [ "We shorten swims when the water is under ", bold("10 degrees"), ". If the sea is rough, we cancel by 6 am and say so on the ", link("home page", "/#questions"), "." ])
          ]),
          column("details-2", [ image("details-image", m[:winter], alt: "The jetty in winter, with a grey, flat sea beyond it") ])
        ], base: { spaceBetween: "xl" }),

        section("practical", [
          column("practical-1", [ iconbox("practical-when", "calendar", "Every Sunday", "From the first Sunday of November\nto the last Sunday of March.") ]),
          column("practical-2", [ iconbox("practical-time", "clock", "At slack water", "The time moves with the tide. Check the table on the noticeboard.") ]),
          column("practical-3", [ iconbox("practical-where", "pin", "The north slipway", "Where the footpath from the car park meets the beach.") ])
        ], label: "When and where", base: { background: "soft", spaceAbove: "section-s", spaceBelow: "section-s", spaceBetween: "xl" }),

        section("words", [
          column("words-1", [ quote("words-quote", "Ten minutes in the water, an hour of feeling good.", attribution: "A winter regular") ]),
          column("words-2", [
            text("words-text", [ "New to cold water? Start with the ", italic("beginners’ course"), " in the autumn." ]),
            divider("words-divider"),
            spacer("words-spacer", "s"),
            button("words-button", "Back to the club", "/", base: { background: "primary", color: "background" })
          ], base: { verticalAlign: "middle" })
        ], base: { spaceBetween: "xl" })
      ]
    )
  end

  def notices_page(m)
    long_alt = "A tall orange flask and two white cups of tea, steaming, set on a flat dark rock just above the waterline after an early swim, " \
               "with the sea calm and pale green behind them, the sky pink with first light, and nobody else in sight: the kind of morning the winter series is for."
    document(
      title: "Notices",
      description: "Odd shapes on purpose: four columns, a word too long for its line, emoji, nested lists and a long alt text.",
      sections: [
        section("head", [
          column("head-1", [
            heading("head-heading", "Notices", level: 1),
            text("head-text",
                 [ "Today’s word from the logbook: Seawaterthermometercalibrationlogbookentriesforthewholewinterseason, which no line is wide enough for." ],
                 [ "Swims this week 🌊🧊☕ and one more 🏊‍♀️.", line_break, "Written the way members write: café, naïve, 日本語, שלום." ])
          ])
        ], base: { spaceAbove: "section-s", spaceBelow: "section-s" }),

        section("four", [
          column("four-1", [ iconbox("four-visitors", "globe", "Visitors welcome", "Swim with us for a week before you join.") ]),
          column("four-2", [ iconbox("four-lifeguard", "info", "Lifeguard on Sundays", "From 8 to 10 am, on the slipway.") ]),
          column("four-3", [
            heading("four-lost", "Lost property", level: 3),
            text("four-lost-text", "Two caps, one left glove, a flask with a dent.")
          ]),
          column("four-4", [ image("four-image", m[:tea], alt: long_alt) ])
        ], label: "Four columns", base: { spaceBetween: "l" }),

        section("night", [
          column("night-1", [
            heading("night-heading", "Night swim, once a year"),
            text("night-text", "On the shortest night, with lights on the buoys. Members only.")
          ]),
          column("night-2", [ button("night-button", "Ask about it", "mailto:night@slackwater.example") ], base: { verticalAlign: "middle" })
        ], label: "Dark band", base: { background: "primary", spaceAbove: "section-s", spaceBelow: "section-s" }),

        section("lists", [
          column("lists-1", [
            heading("lists-heading", "Every swim, in order", level: 3),
            text("lists-text",
                 bullets(
                   item("Before the swim", numbers("Check the tide table", "Tell someone ashore", item("Warm up", bullets("Arms", "Shoulders")))),
                   item("After the swim", numbers("Get dry", "Get warm", start: 4))
                 ),
                 [ "Steps go on from the course notes,", line_break, "which end at step 3." ])
          ]),
          column("lists-2", [
            accordion("lists-questions", [
              [ "What happens if the weather turns while we are already in the water, a long way from the slipway?",
                "We swim back along the buoy line.\nThe lifeguard counts heads at the slipway.\nNobody leaves until everyone is out." ],
              [ "Can I bring a friend?", "Yes, once, for a trial swim." ]
            ])
          ])
        ], label: "Lists"),

        section("desktop-only", [
          column("desktop-only-1", [
            heading("desktop-only-heading", "Shown on desktop and tablets, hidden on phones", level: 3,
                    base: { align: "center" }, tablet: { align: "left" }, phone: { visibility: "hidden" })
          ])
        ], label: "Hidden on phones", base: { spaceAbove: "section-s", spaceBelow: "section-s" })
      ]
    )
  end
end
