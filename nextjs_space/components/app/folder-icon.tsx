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
import { cn } from "@/lib/utils";

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
  if (src) {
    return (
      <span className={cn("relative inline-block shrink-0", imageClassName ?? className)}>
        <Image src={src} alt="" fill sizes="64px" className="object-contain" />
      </span>
    );
  }
  const Icon = ICON_MAP[name ?? "folder"] ?? Folder;
  return <Icon className={className} />;
}

export const FOLDER_ICON_CHOICES = Object.keys(ICON_MAP);
