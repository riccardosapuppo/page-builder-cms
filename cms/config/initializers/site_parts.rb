# The header's and footer's starters (config/parts/header.json and
# footer.json, SiteParts): what the published pages draw until the site
# publishes its own, and the first draft of a part the CMS makes for the
# editor. Read once, as the app starts, and checked once it has, against
# the rules a part's draft is held to (SiteParts.check): a starter the
# editor could not save back would be drawn on every page and refused when
# sent back unchanged, so a file that breaks them stops the CMS here,
# naming each value.
parts = Rails.root.join("config", "parts")
Rails.application.config.x.parts = %w[header footer].to_h do |kind|
  [ kind, JSON.parse(parts.join("#{kind}.json").read(encoding: "UTF-8")).freeze ]
end.freeze

Rails.application.config.after_initialize do
  problems = SiteParts.starter_errors
  unless problems.empty?
    raise "config/parts: the starters break the rules a header's or footer's draft is held to: " +
          problems.map { |kind, errors| "#{kind}.json: " + errors.map { |error| "#{error.pointer.presence || 'the whole'} (#{error.keyword}): #{error.message}" }.join("; ") }.join("; ")
  end
end
