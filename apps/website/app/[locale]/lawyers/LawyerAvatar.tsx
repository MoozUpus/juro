"use client";

import Image from "next/image";
import { useState } from "react";

type Props = {
  className: string;
  fallbackClassName: string;
  initials: string;
  size: number;
  src: string | null;
};

/** Use the branded initial if a third-party profile photo is unavailable. */
export function LawyerAvatar({ className, fallbackClassName, initials, size, src }: Props) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <span aria-hidden="true" className={fallbackClassName}>{initials}</span>;
  return <Image alt="" className={className} height={size} onError={() => setFailed(true)} src={src} unoptimized width={size} />;
}
