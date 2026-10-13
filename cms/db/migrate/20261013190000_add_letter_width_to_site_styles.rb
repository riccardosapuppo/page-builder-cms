# How wide the Headings typeface is drawn, the site style's third choice
# (site-letter-width of schema/tokens.json). A style kept before the
# choice existed takes Normal, the default it was added with.
class AddLetterWidthToSiteStyles < ActiveRecord::Migration[8.1]
  def change
    add_column :site_styles, :letter_width, :string, null: false, default: "normal"
  end
end
