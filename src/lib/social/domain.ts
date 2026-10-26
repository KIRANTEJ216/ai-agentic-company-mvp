export function csv(rows: Record<string, unknown>[]) {
  const keys = Array.from(new Set(rows.flatMap(Object.keys)));
  const cell = (value: unknown) => {
    let text = value == null ? "" : String(value);
    // Protect spreadsheet users against formula injection.
    if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return [
    keys.map(cell).join(","),
    ...rows.map((r) => keys.map((k) => cell(r[k])).join(",")),
  ].join("\r\n");
}
export function uploadType(bytes: Uint8Array): "image/png" | "image/jpeg" {
  if (
    bytes.length > 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((x, i) => bytes[i] === x)
  )
    return "image/png";
  if (
    bytes.length > 3 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255
  )
    return "image/jpeg";
  throw new Error("Upload an original JPEG or PNG image");
}
export function deliveryOutcome(status: number, attempts: number) {
  if (status === 429) return attempts < 4 ? "scheduled" : "failed";
  if (status >= 500) return "confirming"; // could have accepted the write before responding
  return "failed";
}
