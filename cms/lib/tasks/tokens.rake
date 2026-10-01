namespace :tokens do
  desc "Write app/assets/stylesheets/tokens.css from schema/tokens.json and the schema's style enums"
  task css: :environment do
    path = Rails.root.join(SiteTheme::TokenCss::OUTPUT)
    css = SiteTheme::TokenCss.from_schema_dir(Rails.application.config.x.schema_dir)
    File.binwrite(path, css)
    puts "wrote #{path.relative_path_from(Rails.root)} (#{css.bytesize} bytes, #{css.count("\n")} lines)"
  end
end
