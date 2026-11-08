import { useState } from "react";
import { Package } from "lucide-react";


/**
 * Product image or a quiet placeholder. `version` busts the browser cache
 * after an image is replaced (the image URL itself does not change).
 */
export default function ProductThumbnail({
  imageUrl,
  version = 0,
  size = 32,
}: {
  imageUrl: string | null;
  version?: number;
  size?: 32 | 96;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const src = imageUrl ? `${imageUrl}?v=${version}` : null;
  const box = size === 96 ? "size-24 rounded-md" : "size-8 rounded";

  if (!src || failedSrc === src) {
    return (
      <span
        aria-hidden="true"
        className={`${box} inline-flex shrink-0 items-center justify-center bg-ctp-surface0 text-ctp-overlay1`}
      >
        <Package size={size === 96 ? 28 : 14} />
      </span>
    );
  }

  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailedSrc(src)}
      className={`${box} shrink-0 border border-ctp-surface0 bg-ctp-surface0 object-cover`}
    />
  );
}
