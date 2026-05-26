import type { ContainerRecord, ItemStackView, SaveProgress, SaveReport, SaveStatus, ScanResult, SearchFilter, SlotMove, SlotUpdate } from '../shared/types'
import { invokeOptional } from '../shared/valueUtils'
import { logger } from './logging/AppLogger'
import { filterContainers } from './search/SearchIndex'
import { saveModifiedRegions, type SaveProgressCallback } from './world/SaveCoordinator'
import { readRegion, type LoadedRegion } from './world/AnvilRegionReader'
import { findItemsHits, hitsToContainers } from './world/ItemsLocator'
import { moveSlotInCompound, transferSlotItem } from './world/NbtEditor'
import { getCompoundFieldFirst, getIntFirst } from './world/nbtUtils'
import { toScanResult, type ScanSession, scanWorld, type ProgressCallback, type ContainerBinding } from './world/WorldScanner'
import type { NbtCompound } from './world/nbtUtils'

/**
 * NBT compound からブロック座標を抽出する。
 *
 * @param compound - Block Entity / Entity の NBT
 * @returns ワールド座標。取得できない場合は null
 */
function extractPosition(compound: NbtCompound): { x: number; y: number; z: number } | null {
  const x = getIntFirst(compound, 'x', 'X')
  const y = getIntFirst(compound, 'y', 'Y')
  const z = getIntFirst(compound, 'z', 'Z')
  // 座標が直接入っている場合はそのまま返す
  if (x !== undefined && y !== undefined && z !== undefined) {
    return { x, y, z }
  }

  const posField = getCompoundFieldFirst(compound, 'Pos', 'pos', 'Position')
  if (posField && posField.type === 'list') {
    const values = (posField.value as { value: number[] }).value
    if (values.length >= 3) {
      return { x: Math.floor(values[0]), y: Math.floor(values[1]), z: Math.floor(values[2]) }
    }
  }
  return null
}

/**
 * コンテナに対応する Items タグの親 compound をセッションから解決する。
 *
 * @param container - 対象コンテナ
 * @param session - スキャンセッション
 * @param binding - リージョン / チャンク座標の紐付け
 * @returns Items を保持する NBT compound。見つからなければ null
 */
function resolveOwnerCompound(
  container: ContainerRecord,
  session: ScanSession,
  binding: ContainerBinding
): NbtCompound | null {
  const region = session.regions.get(binding.regionFile)
  if (!region) {
    return null
  }

  const chunk = region.chunks.get(`${binding.localX},${binding.localZ}`)
  if (!chunk) {
    return null
  }

  const hits = findItemsHits(chunk.nbt)
  const byPath = hits.find((hit) => hit.nbtPath === container.nbtPath)
  if (byPath) {
    return byPath.ownerCompound
  }

  // NBT パスが一致しない場合は座標でコンテナを特定する
  for (const hit of hits) {
    if (positionMatches(container, hit.ownerCompound)) {
      return hit.ownerCompound
    }
  }

  return null
}

function positionMatches(container: ContainerRecord, compound: NbtCompound): boolean {
  const position = extractPosition(compound)
  if (position !== null && position.x === container.posX && position.y === container.posY && position.z === container.posZ) {
    // 座標が取得でき、コンテナ座標と一致する場合だけ同一コンテナとみなす
    return true
  }
  return false
}

function chunkKey(localX: number, localZ: number): string {
  return `${localX},${localZ}`
}

/**
 * ワールドの読み込み・編集・保存を担うアプリケーションセッション。
 *
 * @remarks
 * スキャン結果と未保存のリージョン変更をメモリ上で保持する。
 */
export class AppSession {
  private session: ScanSession | null = null
  private dirtyRegions = new Set<string>()
  private dirtyChunkKeys = new Map<string, Set<string>>()
  private operationQueue: Promise<void> = Promise.resolve()

  /**
   * セッション状態を書き換える操作を 1 つずつ実行する。
   *
   * @param operation - 実行する処理
   * @returns 処理の戻り値
   */
  private runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const runAfterPrevious = this.operationQueue.then(operation, operation)
    this.operationQueue = runAfterPrevious.then(() => undefined, () => undefined)
    return runAfterPrevious
  }

  /**
   * ワールドを走査し、Items タグを持つコンテナ一覧を構築する。
   *
   * @param worldPath - ワールドディレクトリ
   * @param onProgress - 進捗通知（省略可）
   * @returns スキャン結果
   */
  async scan(worldPath: string, onProgress?: ProgressCallback): Promise<ScanResult> {
    return this.runExclusive(async () => this.scanExclusive(worldPath, onProgress))
  }

  /**
   * 排他制御下でワールドを走査する。
   *
   * @param worldPath - ワールドディレクトリ
   * @param onProgress - 進捗通知（省略可）
   * @returns スキャン結果
   */
  private async scanExclusive(worldPath: string, onProgress?: ProgressCallback): Promise<ScanResult> {
    const startedAt = Date.now()
    logger.info('session', 'ワールドスキャン開始', { worldPath })

    if (this.dirtyRegions.size > 0) {
      logger.warn('session', '未保存変更があるためスキャンを拒否', {
        pendingRegionCount: this.dirtyRegions.size
      })
      throw new Error('未保存の変更があります。保存してから再スキャンしてください。')
    }

    // ワールド全体を走査してセッションを構築する
    this.session = await scanWorld(worldPath, onProgress)
    this.dirtyRegions.clear()
    this.dirtyChunkKeys.clear()

    const result = toScanResult(this.session)
    logger.info('session', 'ワールドスキャン完了', {
      worldPath,
      durationMs: Date.now() - startedAt,
      containerCount: result.containers.length,
      errorCount: result.errors.length
    })
    if (result.errors.length > 0) {
      logger.warn('session', 'スキャン中にエラーが発生', { errors: result.errors.slice(0, 20) })
    }
    return result
  }

  /**
   * 編集対象リージョンをメモリへ遅延ロードする。
   *
   * @param regionFile - .mca ファイルの絶対パス
   * @returns ロード済みリージョン。セッション未初期化時は null
   */
  private async ensureRegionLoaded(regionFile: string): Promise<LoadedRegion | null> {
    if (!this.session) {
      return null
    }

    const cached = this.session.regions.get(regionFile)
    if (cached) {
      return cached
    }

    logger.debug('session', 'リージョンを遅延ロード', { regionFile })
    // 初回編集時にリージョンファイルをディスクから読み込む
    const region = await readRegion(regionFile)
    this.session.regions.set(regionFile, region)
    logger.info('session', 'リージョン遅延ロード完了', {
      regionFile,
      chunkCount: region.chunks.size
    })
    return region
  }

  private markChunkDirty(binding: ContainerBinding): string {
    // 変更対象リージョンとチャンクを dirty として記録する
    this.dirtyRegions.add(binding.regionFile)

    const chunkKeyValue = chunkKey(binding.localX, binding.localZ)
    let dirtyChunks = this.dirtyChunkKeys.get(binding.regionFile)
    if (dirtyChunks === undefined) {
      // 初回変更のリージョンには dirty chunk 集合を作成する
      dirtyChunks = new Set<string>()
    }
    dirtyChunks.add(chunkKeyValue)
    this.dirtyChunkKeys.set(binding.regionFile, dirtyChunks)
    return chunkKeyValue
  }

  private buildRefreshedContainer(
    container: ContainerRecord,
    owner: NbtCompound,
    updatedItems: ItemStackView[]
  ): ContainerRecord {
    const refreshed = hitsToContainers(
      [{ nbtPath: container.nbtPath, sourceType: container.sourceType, ownerCompound: owner, itemsPath: container.nbtPath }],
      {
        dimension: container.dimension,
        regionFile: container.regionFile,
        chunkX: container.chunkX,
        chunkZ: container.chunkZ
      }
    )[0]

    let nextItems = updatedItems
    if (updatedItems.length === 0) {
      // mutate 側が空配列を返した場合は再パース結果を優先する
      if (refreshed !== undefined) {
        nextItems = refreshed.items
      } else {
        nextItems = []
      }
    }

    let nextSlotCount = container.slotCount
    if (refreshed !== undefined) {
      // 再パースできた場合は推定スロット数も最新化する
      nextSlotCount = refreshed.slotCount
    }

    return {
      ...container,
      items: nextItems,
      slotCount: nextSlotCount
    }
  }

  /**
   * フィルタ条件に一致するコンテナ一覧を返す。
   *
   * @param filter - 検索条件（省略時は全件）
   * @returns コンテナ配列
   */
  getContainers(filter?: SearchFilter): ContainerRecord[] {
    if (!this.session) {
      return []
    }
    return filterContainers(this.session.containers, filter)
  }

  /**
   * 指定スロットのアイテム内容を更新する。
   *
   * @param update - 更新内容
   * @returns 更新後のコンテナ。失敗時は null
   */
  async updateSlot(update: SlotUpdate): Promise<ContainerRecord | null> {
    return this.runExclusive(async () =>
      this.mutateContainer(update.containerId, (owner) =>
        transferSlotItem(owner, update.slot, update.item)
      )
    )
  }

  /**
   * スロット間でアイテムを移動（スワップ）する。
   *
   * @param move - 移動元・移動先スロット
   * @returns 更新後のコンテナ。失敗時は null
   */
  async moveSlot(move: SlotMove): Promise<ContainerRecord | null> {
    return this.runExclusive(async () =>
      this.mutateContainer(move.containerId, (owner) =>
        moveSlotInCompound(owner, move.fromSlot, move.toSlot)
      )
    )
  }

  /**
   * NBT を変更し、セッション上のコンテナ表示と dirty 状態を更新する。
   *
   * @param containerId - 対象コンテナ ID
   * @param mutate - Items compound に対する変更処理
   * @returns 更新後のコンテナ。失敗時は null
   */
  private async mutateContainer(
    containerId: string,
    mutate: (owner: NbtCompound, container: ContainerRecord) => ItemStackView[]
  ): Promise<ContainerRecord | null> {
    if (!this.session) {
      return null
    }

    const containerIndex = this.session.containers.findIndex((entry) => entry.id === containerId)
    if (containerIndex < 0) {
      return null
    }

    const container = this.session.containers[containerIndex]
    const binding = this.session.bindings.get(container.id)
    if (!binding) {
      return null
    }

    await this.ensureRegionLoaded(binding.regionFile)
    const owner = resolveOwnerCompound(container, this.session, binding)
    if (!owner) {
      return null
    }

    const updatedItems = mutate(owner, container)
    const chunkKeyValue = this.markChunkDirty(binding)

    logger.info('session', 'コンテナを変更', {
      containerId,
      regionFile: binding.regionFile,
      chunk: chunkKeyValue,
      pendingRegionCount: this.dirtyRegions.size
    })

    const nextContainer = this.buildRefreshedContainer(container, owner, updatedItems)

    this.session.containers[containerIndex] = nextContainer
    return nextContainer
  }

  /**
   * 未保存のリージョン変更をディスクへ書き込む。
   *
   * @param onProgress - 保存進捗通知（省略可）
   * @returns 保存結果レポート
   */
  async saveChanges(onProgress?: SaveProgressCallback): Promise<SaveReport> {
    return this.runExclusive(async () => this.saveChangesExclusive(onProgress))
  }

  /**
   * 排他制御下で未保存のリージョン変更を書き込む。
   *
   * @param onProgress - 保存進捗通知（省略可）
   * @returns 保存結果レポート
   */
  private async saveChangesExclusive(onProgress?: SaveProgressCallback): Promise<SaveReport> {
    const startedAt = Date.now()
    if (!this.session) {
      logger.warn('session', '保存失敗: ワールド未読み込み')
      return { success: false, savedFiles: [], errors: ['ワールドが読み込まれていません。先にスキャンしてください。'] }
    }

    if (this.dirtyRegions.size === 0) {
      logger.info('session', '保存スキップ: 変更なし')
      invokeOptional(onProgress, {
        phase: 'save-finished',
        current: 0,
        total: 0,
        message: '保存対象の変更がありません'
      })
      return { success: true, savedFiles: [], errors: [], nothingToSave: true }
    }

    // dirty なリージョンをメモリ上の LoadedRegion に解決する
    const regionsToSave: LoadedRegion[] = []
    for (const filePath of this.dirtyRegions) {
      const region = this.session.regions.get(filePath)
      if (region !== undefined) {
        regionsToSave.push(region)
      }
    }

    if (regionsToSave.length === 0) {
      logger.error('session', '保存失敗: dirty リージョンをメモリ上で解決できず')
      return {
        success: false,
        savedFiles: [],
        errors: ['変更したリージョンをメモリ上で読み込めませんでした。再スキャンして編集をやり直してください。']
      }
    }

    logger.criticalInfo('session', '保存開始', {
      worldPath: this.session.worldPath,
      regionCount: regionsToSave.length,
      dirtyRegionFiles: [...this.dirtyRegions]
    })

    // 部分書き込み用にチャンク単位の dirty 情報を集める
    const dirtyChunksByRegion = new Map<string, Set<string>>()
    for (const region of regionsToSave) {
      const keys = this.dirtyChunkKeys.get(region.filePath)
      if (keys !== undefined && keys.size > 0) {
        dirtyChunksByRegion.set(region.filePath, keys)
      }
    }

    const report = await saveModifiedRegions(regionsToSave, onProgress, dirtyChunksByRegion)
    if (report.success) {
      this.dirtyRegions.clear()
      this.dirtyChunkKeys.clear()
      logger.criticalInfo('session', '保存完了', {
        durationMs: Date.now() - startedAt,
        savedFileCount: report.savedFiles.length
      })
    } else {
      for (const savedFile of report.savedFiles) {
        // 成功済みリージョンは再保存対象から外す
        this.dirtyRegions.delete(savedFile)
        this.dirtyChunkKeys.delete(savedFile)
      }
      logger.criticalError('session', '保存失敗', {
        durationMs: Date.now() - startedAt,
        errors: report.errors
      })
    }
    return report
  }

  /**
   * ワールド読み込み状態と未保存リージョン数を返す。
   *
   * @returns 保存 UI 向けステータス
   */
  getSaveStatus(): SaveStatus {
    return {
      worldLoaded: this.session !== null,
      pendingRegionCount: this.dirtyRegions.size
    }
  }

  /**
   * 現在ロード中のワールドパスを返す。
   *
   * @returns ワールドパス。未スキャン時は null
   */
  getWorldPath(): string | null {
    if (this.session === null) {
      return null
    }
    return this.session.worldPath
  }
}
