// The part of @rails/activestorage 8.1.400 the editor uses, which ships no
// types: DirectUpload, as its src/direct_upload.js, blob_record.js and
// blob_upload.js behave. create() first POSTs the file's name, size, type
// and MD5 to the given address (the API's /media/direct_uploads), then PUTs
// the bytes where the answer says, then calls back with the first answer,
// whose signed_id makes the media item, less its direct_upload member,
// which the library removes. An error is the message string the library
// builds ("Error creating Blob for ...", "Error storing ...", "Error
// reading ...").
declare module "@rails/activestorage" {
  export interface DirectUploadBlob {
    signed_id: string;
    filename: string;
    content_type: string;
    byte_size: number;
    checksum: string;
  }

  export interface DirectUploadDelegate {
    directUploadWillCreateBlobWithXHR?(xhr: XMLHttpRequest): void;
    directUploadWillStoreFileWithXHR?(xhr: XMLHttpRequest): void;
  }

  export class DirectUpload {
    constructor(file: File, url: string, delegate?: DirectUploadDelegate, customHeaders?: Record<string, string>);
    readonly id: number;
    readonly file: File;
    readonly url: string;
    create(callback: (error: string | Error | null, blob?: DirectUploadBlob) => void): void;
  }
}
