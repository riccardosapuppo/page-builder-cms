# frozen_string_literal: true

# A stylesheet of free colours (FreeColors), or of free type (FreeType),
# kept under the SHA-256 of its text: a page links /colors/<digest>.css
# (FreeColorsController) and /type/<digest>.css (FreeTypeController), so
# each address names only rules a page of the site was drawn with, the
# same bytes for good, however many colours or values the page names. The
# two kinds share the table, each told by its first line, which each
# address checks. A sheet is kept the first time a page that needs it is
# drawn; a page drawn again with the same values finds it, with a read and
# no write. None is deleted: a copy of a page in the cache, or in a
# visitor's browser, may still link it, and each is a few kilobytes.
class ColorSheet < ApplicationRecord
  # The digest of the sheet, kept if it was not.
  def self.keep(css)
    digest = Digest::SHA256.hexdigest(css)
    insert_all([ { digest: digest, css: css } ], unique_by: :digest) unless exists?(digest: digest)
    digest
  end
end
