/** Items タグの所有者種別 */
export type SourceType = 'entity' | 'block_entity'

/** UI 表示用のアイテムスタック */
export interface ItemStackView {
  /** スロット番号 */
  slot: number
  /** アイテム ID（例: minecraft:diamond） */
  itemId: string
  /** 個数 */
  count: number
  /** 表示名や components 由来の要約 */
  displaySummary: string
  /** 元 NBT を plain object 化したもの */
  raw: Record<string, unknown>
}

/** チェスト等のコンテナ 1 件分のメタデータと中身 */
export interface ContainerRecord {
  /** セッション内で一意な ID */
  id: string
  /** Block Entity / Entity の種類 ID */
  blockEntityId: string
  /** ディメンション名 */
  dimension: string
  /** 所属リージョンファイルの絶対パス */
  regionFile: string
  /** チャンク X 座標 */
  chunkX: number
  /** チャンク Z 座標 */
  chunkZ: number
  /** ブロック X 座標 */
  posX: number
  /** ブロック Y 座標 */
  posY: number
  /** ブロック Z 座標 */
  posZ: number
  /** 座標を NBT から取得できた場合 true */
  positionKnown: boolean
  sourceType: SourceType
  /** Items タグへの NBT パス */
  nbtPath: string
  /** スロット数 */
  slotCount: number
  /** 格納アイテム一覧 */
  items: ItemStackView[]
}

/** スキャン進捗 */
export interface ScanProgress {
  phase: string
  current: number
  total: number
  message: string
}

/** 保存進捗 */
export interface SaveProgress {
  phase: string
  current: number
  total: number
  message: string
}

/** リソースパック取得進捗 */
export interface AssetDownloadProgress {
  phase: string
  current: number
  total: number
  message: string
}

/** バニラ / ワールド resource pack の準備状態 */
export interface AssetsStatus {
  ready: boolean
  vanillaVersion: string | null
  worldPackLoaded: boolean
}

/** ワールドスキャンの結果 */
export interface ScanResult {
  worldPath: string
  containers: ContainerRecord[]
  errors: string[]
}

/** コンテナ一覧の検索条件 */
export interface SearchFilter {
  /** アイテム ID 部分一致 */
  query?: string
  /** NBT JSON 部分一致 */
  nbt?: string
  dimension?: string
  sourceType?: SourceType
  minCount?: number
}

/** 保存処理の結果 */
export interface SaveReport {
  success: boolean
  savedFiles: string[]
  errors: string[]
  /** 変更がなかった場合 true */
  nothingToSave?: boolean
}

/** 未保存変更の有無 */
export interface SaveStatus {
  worldLoaded: boolean
  pendingRegionCount: number
}

/** スロット内容の更新リクエスト */
export interface SlotUpdate {
  containerId: string
  slot: number
  item: ItemStackView | null
}

/** スロット間の移動リクエスト */
export interface SlotMove {
  containerId: string
  fromSlot: number
  toSlot: number
}

/** preload 経由で renderer に公開する IPC API */
export interface WorldChestAPI {
  selectWorld(): Promise<string | null>
  scanWorld(worldPath: string): Promise<ScanResult>
  onScanProgress(callback: (progress: ScanProgress) => void): () => void
  onSaveProgress(callback: (progress: SaveProgress) => void): () => void
  ensureAssets(): Promise<AssetsStatus>
  getAssetsStatus(): Promise<AssetsStatus>
  onAssetDownloadProgress(callback: (progress: AssetDownloadProgress) => void): () => void
  getContainers(filter?: SearchFilter): Promise<ContainerRecord[]>
  updateSlot(update: SlotUpdate): Promise<ContainerRecord | null>
  moveSlot(move: SlotMove): Promise<ContainerRecord | null>
  saveChanges(): Promise<SaveReport>
  getSaveStatus(): Promise<SaveStatus>
  resolveTexture(itemId: string): Promise<string | null>
}

declare global {
  interface Window {
    worldChest: WorldChestAPI
  }
}
