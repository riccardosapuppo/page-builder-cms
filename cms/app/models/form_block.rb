# frozen_string_literal: true

# A form block of a page document, read the way the page draws it: the
# form partial (app/views/blocks/_form.html.erb) draws these fields, and
# SubmissionsController checks a visitor's answers against the same ones,
# so the limit a browser holds a field to and the one the server counts
# are one number.
#
# A field the renderer does not know (another kind, no name, not an
# object) is left out. A limit the schema refuses (not a whole number, out
# of its kind's range) gives way to the kind's own: 300 characters for a
# line of text and 5000 for a longer one. An email address takes 254, the
# longest the standard allows, and a checkbox none. A whole number written
# as 100.0 is a whole number here, as it is to the editor's renderer.
class FormBlock
  KINDS = %w[text email textarea checkbox].freeze

  # The longest answer each kind of text takes, and the most fields a form
  # holds: the schema's maxima (formField, form.items), which a test reads
  # back from the schema.
  LONGEST = { "text" => 300, "textarea" => 5000 }.freeze
  EMAIL_LENGTH = 254
  MOST_FIELDS = 20

  Field = Data.define(:name, :kind, :label, :required, :max_length)

  attr_reader :id, :fields, :confirmation

  # The form block with this id among the widgets the page draws, in the
  # strict tree the renderer keeps (sections, their columns, their
  # widgets), or nil.
  def self.find(document, id)
    return nil unless id.is_a?(String) && document.is_a?(Hash)

    list(document["sections"], "section").each do |section|
      list(section["children"], "column").each do |column|
        form = list(column["children"], "form").find { |widget| widget["id"] == id }
        return new(form) if form
      end
    end
    nil
  end

  def self.list(blocks, type)
    (blocks.is_a?(Array) ? blocks : []).select { |block| block.is_a?(Hash) && block["type"] == type }
  end
  private_class_method :list

  # The fields of a form block, in order, as the page draws them.
  def self.fields(block)
    props = block["props"].is_a?(Hash) ? block["props"] : {}
    items = props["items"].is_a?(Array) ? props["items"] : []
    items.filter_map do |item|
      next unless item.is_a?(Hash) && item["name"].is_a?(String) && !item["name"].empty? && KINDS.include?(item["kind"])

      Field.new(name: item["name"], kind: item["kind"], label: item["label"].is_a?(String) ? item["label"] : "",
                required: item["required"] == true, max_length: max_length(item))
    end
  end

  def self.max_length(item)
    return EMAIL_LENGTH if item["kind"] == "email"

    longest = LONGEST[item["kind"]]
    return nil unless longest

    own = item["maxLength"]
    whole = own.is_a?(Integer) || (own.is_a?(Float) && own.finite? && own == own.floor)
    whole && own.between?(1, longest) ? own.to_i : longest
  end
  private_class_method :max_length

  def initialize(block)
    @id = block["id"]
    @fields = self.class.fields(block)
    props = block["props"].is_a?(Hash) ? block["props"] : {}
    @confirmation = props["confirmation"].is_a?(String) ? props["confirmation"] : ""
  end
end
