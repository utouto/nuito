export type TimeMode = "known" | "unknown";
export interface Settings {
  id: "settings";
  dayBoundaryTime: string;
  journalPromptTime: string;
  timezone: string;
  imageMaxLongEdge: number;
  imageQuality: number;
  schemaVersion: number;
  started: boolean;
  updatedAt?: string;
}
export interface Plush {
  id: string;
  name: string;
  icon?: Blob;
  iconCrop?: PlushIconCrop;
  themeColor?: string;
  createdAt: string;
  updatedAt: string;
  hidden: boolean;
}
export interface PlushIconCrop {
  x: number;
  y: number;
  zoom: number;
}
export interface Place {
  latitude: number;
  longitude: number;
  name: string;
  source: "current" | "map" | "manual";
}
export interface PostImage {
  id: string;
  full: Blob;
  thumbnail: Blob;
  width: number;
  height: number;
  mimeType: string;
  byteSize: number;
  displayOrder: number;
  isCover: boolean;
}
export interface Post {
  id: string;
  body: string;
  plushIds: string[];
  images: PostImage[];
  timeMode: TimeMode;
  occurredLocalDateTime?: string;
  manualLogicalDate?: string;
  place?: Place;
  createdAt: string;
  updatedAt: string;
}
export interface Journal {
  logicalDate: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  lastPostChangeAtAtSave?: string;
}
