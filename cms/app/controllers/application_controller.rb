class ApplicationController < ActionController::Base
  # No browser gate: published pages are plain HTML and CSS meant for every
  # visitor, and the generated allow_browser check answered 406 to browsers
  # it judged too old, such as earlier versions of Safari.
end
