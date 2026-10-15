# frozen_string_literal: true

# Collections for the tests: News, a collection with a field of most types
# and a date to order its entries by, and entries of it.
module CollectionCases
  def news_definition(prefix: "news", name: "News")
    {
      "name" => name,
      "prefix" => prefix,
      "fields" => [
        { "key" => "summary", "label" => "Summary", "type" => "paragraph", "required" => true },
        { "key" => "body", "label" => "Body", "type" => "richText", "required" => false },
        { "key" => "picture", "label" => "Picture", "type" => "image", "required" => false },
        { "key" => "day", "label" => "Day", "type" => "date", "required" => true },
        { "key" => "places", "label" => "Places", "type" => "number", "required" => false, "min" => 0, "max" => 40 },
        { "key" => "booking", "label" => "Booking", "type" => "link", "required" => false },
        { "key" => "members-only", "label" => "Members only", "type" => "toggle", "required" => false },
        { "key" => "level", "label" => "Level", "type" => "choice", "required" => true, "options" => [ "Beginner", "Improver" ] }
      ],
      "sort" => { "by" => "day", "direction" => "desc" }
    }
  end

  # An entry of News: the required values, and any given.
  def news_entry(title: "Dawn swims start again", slug: "dawn-swims", values: {})
    { "title" => title, "slug" => slug, "values" => { "summary" => "Twice a week at first light.", "day" => "2026-05-02", "level" => "Beginner" }.merge(values) }
  end

  def create_news(prefix: "news")
    Collection.create_with_template!(news_definition(prefix: prefix))
  end

  def rich_text(words)
    { "type" => "doc", "content" => [ { "type" => "paragraph", "content" => [ { "type" => "text", "text" => words } ] } ] }
  end
end
