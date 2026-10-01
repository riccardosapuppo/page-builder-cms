# frozen_string_literal: true

module BlockDocument
  # Brings a stored document up to the current schemaVersion.
  #
  # Drafts and versions are stored as they were saved and never rewritten
  # in bulk. When the shape of the document changes, the schema's
  # schemaVersion goes up by one and a step is added to STEPS that turns a
  # document of the old version into one of the new; a document is upgraded
  # when it is read for the editor and when a version is restored, so a
  # version saved years ago can still be restored.
  #
  # Version 1 is the first shape, so there is nothing to upgrade yet: a
  # version 1 document goes through unchanged. The loop below is the place
  # the steps will go, and it is tested with steps of its own.
  module Upgrade
    CURRENT = 1

    # STEPS[n] takes a document of schemaVersion n and returns one of
    # schemaVersion n + 1. Each step is a pure function of the document.
    STEPS = {}.freeze

    # The steps upgrade uses. Tests set it to steps of their own to stand
    # for a schema that has moved on; nothing else changes it.
    mattr_accessor :steps, default: STEPS

    class Unsupported < StandardError; end

    module_function

    def call(document, steps: Upgrade.steps, current: CURRENT)
      version = document.is_a?(Hash) ? document["schemaVersion"] : nil
      unless version.is_a?(Integer)
        raise Unsupported, "The document has no integer schemaVersion."
      end
      if version > current
        raise Unsupported, "The document is of schemaVersion #{version}, newer than this server's #{current}."
      end

      while version < current
        step = steps[version] or raise Unsupported, "There is no upgrade from schemaVersion #{version}."
        document = step.call(document)
        upgraded = document.is_a?(Hash) ? document["schemaVersion"] : nil
        unless upgraded == version + 1
          raise Unsupported, "The upgrade from schemaVersion #{version} gave #{upgraded.inspect}, not #{version + 1}."
        end
        version = upgraded
      end
      document
    end
  end
end
