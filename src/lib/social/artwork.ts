/** Deterministic browser template; preserve the original and place all copy outside its image area. */
export async function artwork(
  imageUrl: string,
  title: string,
  caption: string,
) {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.src = imageUrl;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.fillStyle = "#f5f3ef";
  ctx.fillRect(0, 0, 1080, 1350);
  const scale = Math.min(1000 / image.naturalWidth, 990 / image.naturalHeight);
  const width = image.naturalWidth * scale,
    height = image.naturalHeight * scale;
  ctx.drawImage(
    image,
    (1080 - width) / 2,
    40 + (990 - height) / 2,
    width,
    height,
  );
  ctx.fillStyle = "#183047";
  ctx.font = "bold 40px sans-serif";
  ctx.fillText(title.slice(0, 42), 50, 1110, 980);
  ctx.font = "28px sans-serif";
  const words = caption.replace(/\n/g, " ").split(/\s+/);
  let line = "",
    y = 1170,
    consumed = 0;
  for (const word of words) {
    const next = line + word + " ";
    if (ctx.measureText(next).width > 970) {
      ctx.fillText(line, 50, y);
      y += 40;
      line = word + " ";
      if (y > 1290) break;
    } else line = next;
    consumed++;
  }
  if (y <= 1290) ctx.fillText(line, 50, y);
  if (consumed < words.length) {
    ctx.fillStyle = "#183047";
    ctx.font = "20px sans-serif";
    ctx.fillText("Full caption accompanies this image", 50, 1330);
  }
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Export failed"))),
      "image/jpeg",
      0.93,
    ),
  );
}
