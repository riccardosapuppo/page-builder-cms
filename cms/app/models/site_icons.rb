# frozen_string_literal: true

# The icons of the icon box widget, read from schema/icons.svg: one symbol
# per name of the schema's iconbox enum. The page draws them inline, rebuilt
# element by element with ActionView's tag helpers (BlocksHelper#site_icon),
# so their markup never reaches the page as a trusted string.
#
# Only plain shapes and their geometry are read. The file is part of this
# repository, and test/models/site_icons_test.rb fails if it ever holds
# anything else: an element or attribute outside these lists makes loading
# it raise.
module SiteIcons
  PATH = Rails.application.config.x.schema_dir.join("icons.svg")
  ELEMENTS = %w[path circle ellipse rect line polyline polygon].freeze
  ATTRIBUTES = %w[d cx cy r rx ry x y width height x1 y1 x2 y2 points class].freeze
  CLASSES = %w[fill].freeze

  Icon = Data.define(:view_box, :shapes)

  class Invalid < StandardError; end

  module_function

  def [](name)
    all[name]
  end

  def names
    all.keys
  end

  def all
    @all ||= load(File.read(PATH, encoding: "UTF-8"))
  end

  # The symbols of a sprite, each as its viewBox and its shapes: [element
  # name, {attribute => value}] in document order.
  def load(text)
    xml = Nokogiri::XML(text) { |config| config.strict.nonet }
    xml.remove_namespaces!
    raise Invalid, "the root is <#{xml.root&.name}>, not <svg>" unless xml.root&.name == "svg"

    xml.root.element_children.each do |child|
      raise Invalid, "<#{child.name}> at the top: only <symbol> belongs there" unless child.name == "symbol"

      extra = child.attribute_nodes.map(&:name) - %w[id viewBox]
      raise Invalid, "#{child['id']}: the symbol has attributes #{extra.join(', ')}" unless extra.empty?
    end
    xml.root.element_children.to_h do |symbol|
      shapes = symbol.element_children.map do |shape|
        raise Invalid, "#{symbol['id']}: <#{shape.name}> is not a plain shape" unless ELEMENTS.include?(shape.name)
        raise Invalid, "#{symbol['id']}: <#{shape.name}> holds other elements" unless shape.element_children.empty?

        attributes = shape.attribute_nodes.to_h do |attribute|
          raise Invalid, "#{symbol['id']}: attribute #{attribute.name} is not geometry" unless ATTRIBUTES.include?(attribute.name)
          if attribute.name == "class" && !CLASSES.include?(attribute.value)
            raise Invalid, "#{symbol['id']}: class #{attribute.value} is not one the page styles"
          end

          [ attribute.name, attribute.value ]
        end
        [ shape.name, attributes.freeze ].freeze
      end
      [ symbol["id"], Icon.new(view_box: symbol["viewBox"], shapes: shapes.freeze) ]
    end.freeze
  end
end
