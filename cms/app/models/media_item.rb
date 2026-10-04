# frozen_string_literal: true

# An image of the media library. Documents name it by public_id
# ({"mediaId": ...}); its alt text is only the one the editor proposes when
# the image is placed, since each block keeps its own.
#
# The file reaches the server by a direct upload: the editor asks for a blob,
# sends the bytes straight to the storage service, then creates the item
# from the blob's signed id. The editor has already resized the image in
# the browser, so the server keeps the file as it came and makes no
# variants.
class MediaItem < ApplicationRecord
  # JPEG, PNG, WebP and GIF, recognised by their first bytes. Never SVG: an
  # SVG is a document that can carry script, not just a picture.
  SIGNATURES = {
    "image/jpeg" => ->(head) { head.start_with?("\xFF\xD8\xFF".b) },
    "image/png" => ->(head) { head.start_with?("\x89PNG\r\n\x1A\n".b) },
    "image/gif" => ->(head) { head.start_with?("GIF87a".b, "GIF89a".b) },
    "image/webp" => ->(head) { head.byteslice(0, 4) == "RIFF".b && head.byteslice(8, 4) == "WEBP".b }
  }.freeze
  CONTENT_TYPES = SIGNATURES.keys.freeze

  # The editor sends at most 2400 pixels on the long side; a file this big
  # is not one it made.
  MAX_BYTES = 10.megabytes
  MAX_SIDE = 10_000
  # The alt text of an image in a document is at most 300 characters.
  ALT_MAX_LENGTH = 300
  PUBLIC_ID = /\A[A-Za-z0-9_-]{1,64}\z/

  class InUse < StandardError
    attr_reader :drafts, :versions

    def initialize(drafts:, versions:)
      @drafts = drafts
      @versions = versions
      super("The media item is still used by #{drafts.size} draft(s) and #{versions.size} version(s).")
    end
  end

  has_one_attached :file, dependent: :purge
  has_many :usages, class_name: "MediaUsage", dependent: :restrict_with_exception

  before_validation(on: :create) { self.public_id ||= SecureRandom.alphanumeric(16) }

  validates :public_id, format: { with: PUBLIC_ID }, uniqueness: true
  validates :width, :height, numericality: { only_integer: true, greater_than: 0, less_than_or_equal_to: MAX_SIDE }
  validate :alt_is_one_line
  validate :file_is_an_allowed_image, on: :create

  # The kind of image the bytes are, by their signature, or nil.
  def self.sniff(head)
    SIGNATURES.find { |_type, matches| matches.call(head) }&.first
  end

  # Creates the item from the signed id of a direct upload. The blob must
  # be one this server issued, its bytes must have arrived, and it must not
  # already belong to another item. Attaching it makes Active Storage read
  # its first bytes and correct the declared content type, and the
  # validations then hold the bytes to it. Raises RecordInvalid.
  def self.create_from_upload!(signed_blob_id:, width:, height:, alt: "")
    item = new(width: width, height: height, alt: alt)
    blob = signed_blob_id.is_a?(String) ? ActiveStorage::Blob.find_signed(signed_blob_id) : nil
    problem =
      if blob.nil? then [ :invalid, "is not an upload this server started" ]
      elsif blob.attachments.exists? then [ :taken, "already belongs to another media item" ]
      elsif !blob.service.exist?(blob.key) then [ :not_uploaded, "was never uploaded" ]
      end
    if problem
      item.validate
      item.errors.delete(:file)
      item.errors.add(:file, problem.first, message: problem.last)
      raise ActiveRecord::RecordInvalid, item
    end

    item.file = blob
    item.save!
    item
  end

  # How long an image nothing uses any more stays in the library before
  # PurgeMediaJob deletes it: the same time an automatic version is kept
  # (PageVersion::KEEP_AUTOMATIC_FOR), so an image taken off a page stays
  # at hand for as long as the history around it.
  KEEP_UNUSED_FOR = 30.days

  # Deletes, with their files, the items no draft and no kept version
  # names, and none has named for more than KEEP_UNUSED_FOR before `at`
  # (last_used_at; in UTC days of 24 hours, and one named exactly that
  # long ago stays, as an automatic version made then does). An item
  # never placed on a page has no last_used_at:
  # it was put in the library on purpose, and stays. Each item is looked
  # at again as it goes (destroy_unless_used!), so a save that placed it
  # meanwhile keeps it. Returns the public ids deleted.
  def self.purge_unused!(at: Time.current)
    where.missing(:usages).where(last_used_at: ...(at.utc - KEEP_UNUSED_FOR)).find_each.filter_map do |item|
      item.destroy_unless_used!
      item.public_id
    rescue InUse
      nil
    end
  end

  # Deletes the item and its file, unless a draft or a kept version still
  # names it: then nothing changes and InUse says who uses it.
  def destroy_unless_used!
    transaction do
      drafts = Draft.where(id: usages.where.not(draft_id: nil).select(:draft_id)).includes(:page).to_a
      versions = PageVersion.where(id: usages.where.not(page_version_id: nil).select(:page_version_id)).order(:page_id, :number).to_a
      raise InUse.new(drafts: drafts, versions: versions) if drafts.any? || versions.any?

      destroy!
    end
  end

  private

  def alt_is_one_line
    return if alt == ""
    return if BlockDocument::Schema.line?(alt, max: ALT_MAX_LENGTH)

    errors.add(:alt, :invalid, message: "must be empty, or one line of text with a visible character, at most #{ALT_MAX_LENGTH} characters")
  end

  def file_is_an_allowed_image
    unless file.attached?
      errors.add(:file, :blank)
      return
    end

    blob = file.blob
    if CONTENT_TYPES.exclude?(blob.content_type)
      errors.add(:file, :content_type, message: "must be a JPEG, PNG, WebP or GIF image")
    elsif blob.byte_size > MAX_BYTES
      errors.add(:file, :too_large, message: "must be at most #{MAX_BYTES / 1.megabyte} MB")
    else
      head =
        begin
          blob.download_chunk(0...16)
        rescue ActiveStorage::FileNotFoundError
          errors.add(:file, :not_uploaded, message: "was never uploaded")
          return
        end
      unless self.class.sniff(head) == blob.content_type
        errors.add(:file, :content_mismatch, message: "is not the #{blob.content_type} image it claims to be")
      end
    end
  end
end
