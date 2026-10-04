# As a Solid Queue supervisor starts (inside Puma, config/puma.rb, or as
# bin/jobs), and before its workers take any job, the rows an earlier
# server left when it was stopped abruptly are cleared and their jobs put
# back in the queue (lib/queue_orphans.rb says why Windows needs this).
SolidQueue.on_start do |supervisor|
  Rails.application.executor.wrap do
    released = QueueOrphans.release!(own: supervisor.process_id)
    unless released.empty?
      SolidQueue.logger.info "Solid Queue: released #{released.size} row(s) of a server that stopped abruptly " \
                             "(#{released.map { |_id, kind, pid| "#{kind} #{pid}" }.uniq.join(', ')}); their jobs are back in the queue"
    end
  end
end
