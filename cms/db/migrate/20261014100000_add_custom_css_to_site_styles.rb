# The site's own stylesheet (Custom CSS in Site style), which every page
# draws inside the site (CustomCss). A style kept before it existed has
# none.
class AddCustomCssToSiteStyles < ActiveRecord::Migration[8.1]
  def change
    add_column :site_styles, :custom_css, :text, null: false, default: ""
  end
end
