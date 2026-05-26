import { create } from 'zustand'
import type { AssetDownloadProgress, AssetsStatus, ContainerRecord, SaveProgress, SaveStatus, ScanProgress, ScanResult, SearchFilter } from '../../../shared/types'

/** アプリ全体のワールド・スキャン・保存状態 */
interface WorldChestState {
  worldPath: string | null
  assetsStatus: AssetsStatus | null
  assetProgress: AssetDownloadProgress | null
  scanResult: ScanResult | null
  progress: ScanProgress | null
  saveProgress: SaveProgress | null
  saveStatus: SaveStatus
  containers: ContainerRecord[]
  selectedContainerId: string | null
  selectedSlot: number | null
  filter: SearchFilter
  statusMessage: string
  setWorldPath: (path: string | null) => void
  setAssetsStatus: (status: AssetsStatus | null) => void
  setAssetProgress: (progress: AssetDownloadProgress | null) => void
  setScanResult: (result: ScanResult | null) => void
  setProgress: (progress: ScanProgress | null) => void
  setSaveProgress: (progress: SaveProgress | null) => void
  setSaveStatus: (status: SaveStatus) => void
  setContainers: (containers: ContainerRecord[]) => void
  selectContainer: (id: string | null) => void
  selectSlot: (slot: number | null) => void
  setFilter: (filter: SearchFilter) => void
  setStatusMessage: (message: string) => void
  updateContainer: (container: ContainerRecord) => void
}

/** レンダラー用 Zustand ストア */
export const useWorldChestStore = create<WorldChestState>((set) => ({
  worldPath: null,
  assetsStatus: null,
  assetProgress: null,
  scanResult: null,
  progress: null,
  saveProgress: null,
  saveStatus: { worldLoaded: false, pendingRegionCount: 0 },
  containers: [],
  selectedContainerId: null,
  selectedSlot: null,
  filter: {},
  statusMessage: 'リソースパックを準備しています...',
  setWorldPath: (path) => set({ worldPath: path }),
  setAssetsStatus: (status) => set({ assetsStatus: status }),
  setAssetProgress: (progress) => set({ assetProgress: progress }),
  setScanResult: (result) => set({ scanResult: result, selectedContainerId: null, selectedSlot: null }),
  setProgress: (progress) => set({ progress }),
  setSaveProgress: (progress) => set({ saveProgress: progress }),
  setSaveStatus: (status) => set({ saveStatus: status }),
  setContainers: (containers) => set({ containers }),
  selectContainer: (id) => set({ selectedContainerId: id, selectedSlot: null }),
  selectSlot: (slot) => set({ selectedSlot: slot }),
  setFilter: (filter) => set({ filter }),
  setStatusMessage: (message) => set({ statusMessage: message }),
  updateContainer: (container) =>
    set((state) => ({
      containers: state.containers.map((entry) => {
        if (entry.id === container.id) {
          return container
        }
        return entry
      })
    }))
}))
