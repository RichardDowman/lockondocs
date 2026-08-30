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

export function FolderIcon({
  name,
  className,
}: {
  name?: string | null;
  className?: string;
}) {
  const Icon = ICON_MAP[name ?? "folder"] ?? Folder;
  return <Icon className={className} />;
}

export const FOLDER_ICON_CHOICES = Object.keys(ICON_MAP);
