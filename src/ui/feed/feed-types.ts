import type { FeedItem } from "@/domain/intelligence";
import type { SyncRun } from "@/domain/sync";
import type { ProviderStatus } from "@/ui/common/api";

export interface FeedResponse {
  items: FeedItem[];
  total: number;
  metrics: { scanned: number; unique: number; relevant: number; worthRead: number; mustRead: number };
  provider: ProviderStatus;
  lastRun: SyncRun | null;
}

export interface LibraryFilters { search: string; topic: string; sourceType: string; from: string; to: string; favorite: boolean; unread: boolean }
export const initialFilters: LibraryFilters = { search: "", topic: "", sourceType: "", from: "", to: "", favorite: false, unread: false };
