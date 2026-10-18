"use client";

import {
  Folder,
  User,
  GraduationCap,
  HeartPulse,
  Briefcase,
  FileText,
  Wallet,
  Home,
  Plane,
  Car,
  Fingerprint,
  Receipt,
  Scale,
  Lock,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { VAULT_ICON_LIBRARY } from "@/lib/vault-icon-library";

const ICON_MAP: Record<string, LucideIcon> = {
  folder: Folder,
  user: User,
  "graduation-cap": GraduationCap,
  "heart-pulse": HeartPulse,
  briefcase: Briefcase,
  "file-text": FileText,
  wallet: Wallet,
  home: Home,
  plane: Plane,
  car: Car,
  fingerprint: Fingerprint,
  receipt: Receipt,
  scale: Scale,
  lock: Lock,
};

// Tracey's illustrated vault icons (Build 44), keyed by the stored icon name so
// existing vaults pick them up with no data change. Any key without artwork
// keeps its line icon. Financial ("wallet") added in Build 45.
const ARTWORK: Record<string, string> = {
  fingerprint: "/vault-icons/fingerprint.png",
  receipt: "/vault-icons/receipt.png",
  car: "/vault-icons/car.png",
  home: "/vault-icons/home.png",
  "graduation-cap": "/vault-icons/graduation-cap.png",
  scale: "/vault-icons/scale.png",
  briefcase: "/vault-icons/briefcase.png",
  lock: "/vault-icons/lock.png",
  "heart-pulse": "/vault-icons/heart-pulse.png",
  wallet: "/vault-icons/wallet.png",
  ...Object.fromEntries(VAULT_ICON_LIBRARY.map((icon) => [icon.id, icon.src])),
};

export function hasFolderArtwork(name?: string | null): boolean {
  return !!ARTWORK[name ?? ""];
}

export function FolderIcon({
  name,
  className,
  imageClassName,
}: {
  name?: string | null;
  className?: string;
  /** Size used when the vault has illustrated artwork (defaults to className). */
  imageClassName?: string;
}) {
  const src = ARTWORK[name ?? ""];
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (src && failedSrc !== src) {
    return (
      <span className={cn("relative inline-block shrink-0", imageClassName ?? className)}>
        <Image src={src} alt={VAULT_ICON_LIBRARY.find((icon) => icon.id === name)?.label ?? `${name ?? "Folder"} vault icon`} fill sizes="64px" className="object-contain" onError={() => { console.error("Vault icon failed to load:", src); setFailedSrc(src); }} />
      </span>
    );
  }
  const Icon = ICON_MAP[name ?? "folder"] ?? Folder;
  return <Icon className={className} />;
}

export const FOLDER_ICON_CHOICES = Object.keys(ICON_MAP);
