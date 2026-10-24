import { emblemSrc } from "@/lib/emblems";

/** Shows a heraldic emblem image, or the legacy text glyph if it is not an image id. */
export function EmblemIcon({ id, color, size = 20 }: { id?: string | null | undefined; color?: string | undefined; size?: number }) {
  const src = emblemSrc(id);
  if (src) return <img src={src} alt="" width={size} height={size} className="inline-block align-middle" style={{ width: size, height: size, filter: color ? `drop-shadow(0 0 3px ${color})` : undefined }} />;
  return <span style={{ color, fontSize: size * 0.9 }}>{id ?? "✠"}</span>;
}
