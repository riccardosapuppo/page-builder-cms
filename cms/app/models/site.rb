# frozen_string_literal: true

# The site's header and footer: the name beside the mark, the menu, the
# header's button and the footer's two lines, drawn around every page
# (layouts/public.html.erb). The editor changes them (PUT /api/site), and a
# change shows on every published page at its next visit, with no publish
# step, as the site style's does.
#
# One row for the whole site, id 1. Until someone changes the header and
# footer there is no row, and the values of config/site.yml apply. That
# file keeps them as the defaults, and keeps the site's time zone, which
# stays the CMS's own setting.
#
# The values have one shape, $defs/site of the schema the editor validates
# with too, checked after the application rules as a page's document is
# (Site.check). The defaults are checked the same way as the app starts
# (config/initializers/site.rb).
#
# The editor writes the four members at once, so a write from a revision
# older than the row's would put back whatever was changed since (another
# tab's new link). It is refused with the header and footer as they are
# now (Conflict), unless it asks for exactly what is stored: then nothing
# is lost, and it is answered as saved. That also makes a write sent again
# after its answer was lost a success, not a conflict.
class Site < ApplicationRecord
  ID = 1
  MEMBERS = %w[name menu action footer].freeze

  # Values the rules or $defs/site refuse, with the pointers of each.
  class Invalid < StandardError
    attr_reader :errors

    def initialize(errors)
      @errors = errors
      super("The header and footer are not valid: #{errors.map { |e| "#{e.keyword} at #{e.pointer.inspect}" }.join(', ')}")
    end
  end

  # A write from an older revision that would change what is stored.
  class Conflict < StandardError
    attr_reader :site

    def initialize(site)
      @site = site
      super("The header and footer are at revision #{site.revision}.")
    end
  end

  validate :values_are_a_header_and_footer

  # The row, or the defaults at revision 0 when nobody has changed them.
  def self.current
    find_by(id: ID) || new(id: ID, revision: 0, **defaults.symbolize_keys)
  end

  # config/site.yml's header and footer, shaped as the API writes them
  # (string keys all the way down).
  def self.defaults(site = Rails.configuration.x.site)
    JSON.parse(JSON.generate(MEMBERS.to_h { |member| [ member, site[member.to_sym] ] }))
  end

  # Refuses, naming each value, defaults that a change from the editor could
  # not hold: the editor would show them and fail to save them back.
  def self.check_defaults!(site = Rails.configuration.x.site)
    result = check(defaults(site))
    return if result.ok?

    raise Invalid, result.errors
  end

  # The application rules, then $defs/site: the order a page's document is
  # checked in. Returns the values normalised, or the errors.
  def self.check(values)
    rule_errors = BlockDocument::Rules.check_tree(values)
    unless rule_errors.empty?
      return BlockDocument::Result.new(document: nil, errors: rule_errors.map { |e| BlockDocument::Error.at(e.pointer, e.keyword, e.message) })
    end

    schema_errors = BlockDocument::Schema.site_errors(values)
    return BlockDocument::Result.new(document: nil, errors: schema_errors) unless schema_errors.empty?

    BlockDocument::Result.new(document: BlockDocument::Rules.normalize(values), errors: [])
  end

  # Writes values (the four members) over the header and footer read at
  # revision, and raises the revision by one. The check of the revision and
  # the write are one statement, as a draft's save is: of two writes from
  # the same revision, only one changes a row. Returns the site as stored.
  # Raises Invalid or Conflict.
  def self.replace!(revision:, values:, at: Time.current)
    result = check(values)
    raise Invalid, result.errors unless result.ok?

    value = result.document
    columns = { name: value["name"], menu: value["menu"], action: value["action"], footer: value["footer"] }
    transaction do
      changed =
        if revision.zero?
          first_row(columns, at)
        else
          where(id: ID, revision: revision).update_all(**columns, revision: revision + 1, updated_at: at)
        end
      site = current
      raise Conflict, site if changed.zero? && site.values != value

      site
    end
  end

  # The first change: the row is made. Two first changes at once both find
  # no row; the second one's insert is refused by the primary key, and it
  # is then a write from an older revision like any other.
  def self.first_row(columns, at)
    transaction(requires_new: true) { create!(id: ID, revision: 1, created_at: at, updated_at: at, **columns) }
    1
  rescue ActiveRecord::RecordNotUnique
    0
  end
  private_class_method :first_row

  # The four members, as the API and $defs/site write them.
  def values
    { "name" => name, "menu" => menu, "action" => action, "footer" => footer }
  end

  # Errors are recorded under the pointer of their value, less its first
  # slash ("menu/0/href"), as the site style's are under "palette/<slot>";
  # this is the value such an error is about.
  def read_attribute_for_validation(attribute)
    pointer = attribute.to_s
    return super unless pointer.include?("/")

    pointer.split("/").reduce(values) do |value, key|
      case value
      when Hash then value[key]
      when Array then key.match?(/\A\d+\z/) ? value[key.to_i] : nil
      end
    end
  end

  private

  def values_are_a_header_and_footer
    self.class.check(values).errors.each do |error|
      attribute = error.pointer.empty? ? :base : error.pointer.delete_prefix("/").to_sym
      errors.add(attribute, error.keyword.underscore.to_sym, message: error.message)
    end
  end
end
