# The style as it was before the Assistant's last new site, kept so that
# the editor can put it back in one click ("Put the old style back"): its
# palette, type scale and letter width, and when it was kept. None until a
# new site keeps one, and none again once it is put back.
class AddKeptToSiteStyles < ActiveRecord::Migration[8.1]
  def change
    add_column :site_styles, :kept, :json
  end
end
