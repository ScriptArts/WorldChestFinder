import { contextBridge, ipcRenderer } from 'electron'
import type { AssetDownloadProgress, SaveProgress, SaveStatus, SearchFilter, SlotMove, SlotUpdate, WorldChestAPI } from '../shared/types'

/**
 * renderer から利用可能な IPC API。
 *
 * @remarks `contextBridge` 経由で `window.worldChest` として公開される。
 */
const api: WorldChestAPI = {
  selectWorld: () => ipcRenderer.invoke('world:select'),
  scanWorld: (worldPath) => ipcRenderer.invoke('world:scan', worldPath),
  onScanProgress: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: unknown) => {
      callback(progress as Parameters<typeof callback>[0])
    }
    ipcRenderer.on('world:scan-progress', listener)
    return () => {
      ipcRenderer.removeListener('world:scan-progress', listener)
    }
  },
  onSaveProgress: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: unknown) => {
      callback(progress as SaveProgress)
    }
    ipcRenderer.on('world:save-progress', listener)
    return () => {
      ipcRenderer.removeListener('world:save-progress', listener)
    }
  },
  ensureAssets: () => ipcRenderer.invoke('assets:ensure-ready'),
  getAssetsStatus: () => ipcRenderer.invoke('assets:get-status'),
  onAssetDownloadProgress: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: unknown) => {
      callback(progress as AssetDownloadProgress)
    }
    ipcRenderer.on('assets:download-progress', listener)
    return () => {
      ipcRenderer.removeListener('assets:download-progress', listener)
    }
  },
  getContainers: (filter) => ipcRenderer.invoke('world:get-containers', filter),
  updateSlot: (update) => ipcRenderer.invoke('world:update-slot', update),
  moveSlot: (move) => ipcRenderer.invoke('world:move-slot', move),
  saveChanges: () => ipcRenderer.invoke('world:save'),
  getSaveStatus: () => ipcRenderer.invoke('world:get-save-status'),
  discardUnsavedChanges: () => ipcRenderer.invoke('world:discard-unsaved-changes'),
  resolveTexture: (itemId) => ipcRenderer.invoke('assets:resolve-texture', itemId)
}

contextBridge.exposeInMainWorld('worldChest', api)
