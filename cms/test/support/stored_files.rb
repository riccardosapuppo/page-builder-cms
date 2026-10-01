# frozen_string_literal: true

require "zlib"

# Image files made in memory, and the cleanup of what tests upload.
#
# The test storage service writes real files under its own root
# (config/storage.yml, "test"). Rolling back the test's transaction removes
# the blob rows but not the files, so every test that includes this module
# deletes, before the rollback, the file of every blob it can still see.
module StoredFiles
  def self.included(base)
    base.teardown { delete_stored_files }
  end

  # A real PNG of width x height pixels, all of one colour.
  def png_bytes(width: 2, height: 1)
    row = [ 0 ].pack("C") + ([ 30, 91, 76, 255 ].pack("C*") * width)
    chunk = ->(type, data) { [ data.bytesize ].pack("N") + type + data + [ Zlib.crc32(type + data) ].pack("N") }
    "\x89PNG\r\n\x1A\n".b +
      chunk.call("IHDR".b, [ width, height, 8, 6, 0, 0, 0 ].pack("NNCCCCC")) +
      chunk.call("IDAT".b, Zlib::Deflate.deflate(row * height)) +
      chunk.call("IEND".b, "".b)
  end

  def svg_bytes
    %(<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>).b
  end

  # A blob already on the storage service, as after a direct upload: the
  # declared content type is kept as given, never guessed from the bytes,
  # since that is what a client can lie about.
  def uploaded_blob(bytes, filename: "jetty.png", content_type: "image/png")
    ActiveStorage::Blob.create_and_upload!(io: StringIO.new(bytes), filename: filename, content_type: content_type, identify: false)
  end

  def delete_stored_files
    ActiveStorage::Blob.find_each { |blob| blob.service.delete(blob.key) }
  end
end
