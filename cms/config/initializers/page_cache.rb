# frozen_string_literal: true

# The release's digest (PageCache.revision) names the files this process
# runs, so it is made as the process starts and not at the first visit: a
# server started on one release, whose files change before its first
# page is asked for, would otherwise draw the old code and config under
# the new release's name, and keep serving that after a restart.
#
# After the initializers and the eager loading, so the files are read once
# the app has them loaded; and not in an initializer's own body, which
# cannot reach a reloadable constant such as PageCache.
Rails.application.config.after_initialize do
  PageCache.boot!
end
