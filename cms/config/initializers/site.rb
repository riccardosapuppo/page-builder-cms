# The header's and footer's defaults (config/site.yml) are checked as the
# app starts, against the rules a change from the editor is held to
# (Site.check). A default the editor could not save back would be drawn on
# every page until someone changed it, shown in the editor's panel, and
# refused when sent back unchanged; so a file that breaks them stops the
# CMS here, naming each value.
Rails.application.config.after_initialize do
  Site.check_defaults!
rescue Site::Invalid => e
  raise "config/site.yml: the header and footer break the rules a change from the editor is held to: " \
        "#{e.errors.map { |error| "#{error.pointer.presence || 'the whole'} (#{error.keyword}): #{error.message}" }.join('; ')}"
end
