namespace :contract do
  desc "Time the render of contract/fixtures/large-500.json through the block partials (RAILS_ENV=test, ROUNDS=n)"
  task bench: :environment do
    document = JSON.parse(Rails.root.join("..", "contract", "fixtures", "large-500.json").read)
    # The same stub as the goldens: no database, no signed ids.
    media = ->(id) { id.start_with?("missing") ? nil : MediaResolver::Image.new(src: "/media/#{id}.png", width: 800, height: 600) }
    render = -> { ApplicationController.render(inline: "<%= render_document(document, media: media) %>", locals: { document: document, media: media }) }

    rounds = Integer(ENV.fetch("ROUNDS", "30"))
    5.times { render.call }
    times = Array.new(rounds) do
      started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
      html = render.call
      raise "empty render" if html.empty?

      (Process.clock_gettime(Process::CLOCK_MONOTONIC) - started) * 1000
    end.sort
    median = rounds.odd? ? times[rounds / 2] : (times[rounds / 2 - 1] + times[rounds / 2]) / 2
    puts format("large-500.json, %d blocks, %d bytes of HTML: median %.1f ms, min %.1f, max %.1f over %d renders after 5 warm-ups",
                500, render.call.bytesize, median, times.first, times.last, rounds)
    puts "ruby #{RUBY_VERSION} #{RUBY_PLATFORM}, YJIT #{defined?(RubyVM::YJIT) && RubyVM::YJIT.enabled? ? 'on' : 'off'}, Rails #{Rails.version}, #{Rails.env}"
  end
end
