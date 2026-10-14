// A picture made small enough for a question to a model (its longer side
// 1024 px at most), as base64, for the Assistant's Describe the image
// (./AssistantTools.tsx). The browser loads and draws it as the page does:
// an image of the library is this site's own, so the canvas stays
// readable; and only the storage talks to the server (../storage/), so
// the picture is not fetched.
export async function picture(src: string): Promise<{ mediaType: string; base64: string }> {
  const image = new Image();
  image.src = src;
  await image.decode();
  const scale = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
  const small = await new Promise<Blob>((done, fail) => canvas.toBlob((made) => (made ? done(made) : fail(new Error("The picture could not be read."))), "image/jpeg", 0.85));
  const data = await new Promise<string>((done, fail) => {
    const reader = new FileReader();
    reader.onload = () => done(String(reader.result));
    reader.onerror = () => fail(reader.error ?? new Error("The picture could not be read."));
    reader.readAsDataURL(small);
  });
  return { mediaType: "image/jpeg", base64: data.slice(data.indexOf(",") + 1) };
}
