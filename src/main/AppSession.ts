import type { ContainerRecord, ItemStackView, LargeChestHalf, SaveProgress, SaveReport, SaveStatus, ScanResult, SearchFilter, SlotMove, SlotUpdate } from '../shared/types'
import { replaceSlotInSnbt } from '../shared/nbt/SnbtCodec'
import { invokeOptional } from '../shared/valueUtils'
import { logger } from './logging/AppLogger'
import { filterContainers } from './search/SearchIndex'
import { saveModifiedRegions, type SaveProgressCallback } from './world/SaveCoordinator'
import { readRegion, type LoadedRegion } from './world/AnvilRegionReader'
import { findItemsHits, hitsToContainers } from './world/ItemsLocator'
import { getHalfForSlot, toLocalSlot } from './world/LargeChestMerger'
import { moveSlotInCompound, transferSlotItem } from './world/NbtEditor'
import { getCompoundFieldFirst, getIntFirst } from './world/nbtUtils'
import { toScanResult, type ScanSession, scanWorld, type ProgressCallback, type ContainerBinding } from './world/WorldScanner'
import type { NbtCompound } from './world/nbtUtils'
import { parseItemsList } from './world/ItemStackParser'
import { getListItems } from './world/nbtUtils'

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
  // Pos リストから座標を復元する
  if (posField && posField.type === 'list') {
    const values = (posField.value as { value: number[] }).value
    // 3 要素以上あれば XYZ 座標として採用する
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
  // 対象リージョンが未ロードの場合は owner を解決できない
  if (!region) {
    return null
  }

  const chunk = region.chunks.get(`${binding.localX},${binding.localZ}`)
  // 対象チャンクが未ロードの場合は owner を解決できない
  if (!chunk) {
    return null
  }

  const hits = findItemsHits(chunk.nbt)
  const byPath = hits.find((hit) => hit.nbtPath === container.nbtPath)
  // NBT パスが一致する Items owner が見つかった場合は返す
  if (byPath) {
    return byPath.ownerCompound
  }

  // NBT パスが一致しない場合は座標でコンテナを特定する
  for (const hit of hits) {
    // 座標が一致する Items owner を返す
    if (positionMatches(container, hit.ownerCompound)) {
      return hit.ownerCompound
    }
  }

  return null
}

function positionMatches(container: ContainerRecord, compound: NbtCompound): boolean {
  const position = extractPosition(compound)
  // 座標が一致する場合だけ同一コンテナとみなす
  if (position !== null && position.x === container.posX && position.y === container.posY && position.z === container.posZ) {
    return true
  }
  return false
}

function chunkKey(localX: number, localZ: number): string {
  return `${localX},${localZ}`
}

/**
 * ラージチェストの片側に対応する owner compound をリージョン内から検出する。
 */
function resolveOwnerForHalf(
  half: LargeChestHalf,
  session: ScanSession
): NbtCompound | null {
  const region = session.regions.get(half.regionFile)
  // 対象リージョンが未ロードの場合は owner を解決できない
  if (!region) {
    return null
  }

  // リージョン内の各チャンクから対象座標の Items owner を探す
  for (const chunk of region.chunks.values()) {
    const hits = findItemsHits(chunk.nbt)
    // Items タグを持つ NBT 候補を座標で照合する
    for (const hit of hits) {
      const pos = extractPosition(hit.ownerCompound)
      // 対象チェスト半分の座標と一致した owner を返す
      if (pos !== null && pos.x === half.posX && pos.y === half.posY && pos.z === half.posZ) {
        return hit.ownerCompound
      }
    }
  }
  return null
}

/**
 * ラージチェストの片側に対応する binding を探す。
 */
function findBindingForHalf(
  half: LargeChestHalf,
  session: ScanSession
): ContainerBinding | null {
  const region = session.regions.get(half.regionFile)
  // 対象リージョンが未ロードの場合は binding を解決できない
  if (!region) {
    return null
  }

  // リージョン内の各チャンクから対象座標の binding を探す
  for (const chunk of region.chunks.values()) {
    const hits = findItemsHits(chunk.nbt)
    // Items タグを持つ NBT 候補を座標で照合する
    for (const hit of hits) {
      const pos = extractPosition(hit.ownerCompound)
      // 対象チェスト半分の座標と一致したチャンク情報を返す
      if (pos !== null && pos.x === half.posX && pos.y === half.posY && pos.z === half.posZ) {
        return { regionFile: half.regionFile, localX: chunk.localX, localZ: chunk.localZ }
      }
    }
  }
  return null
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

    // 未保存変更がある場合は再スキャンを拒否する
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
    // スキャン中にエラーがあれば警告ログを出す
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
    // セッション未初期化時はロードできない
    if (!this.session) {
      return null
    }

    const cached = this.session.regions.get(regionFile)
    // キャッシュ済みリージョンがあればそれを返す
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
    // 初回変更のリージョンには dirty chunk 集合を作成する
    if (dirtyChunks === undefined) {
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
    // 更新結果が空配列の場合は再パース結果を優先する
    if (updatedItems.length === 0) {
      // 再パース結果があればそれを採用する
      if (refreshed !== undefined) {
        nextItems = refreshed.items
      // 再パースも失敗した場合は空配列とする
      } else {
        nextItems = []
      }
    }

    let nextSlotCount = container.slotCount
    // 再パースできた場合はスロット数も最新化する
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
    // セッション未初期化時は空配列を返す
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
    return this.runExclusive(async () => {
      // セッション未初期化時は更新できない
      if (!this.session) return null
      const containerIndex = this.session.containers.findIndex((e) => e.id === update.containerId)
      // 対象コンテナが見つからない場合は null を返す
      if (containerIndex < 0) return null
      const container = this.session.containers[containerIndex]

      // ラージチェストの場合は片側 owner を更新する
      if (container.largeChest) {
        return this.mutateLargeChest(containerIndex, update.slot, (owner) => {
          const localSlot = toLocalSlot(update.slot)
          let localItem: ItemStackView | null = null
          // 更新アイテムがある場合はローカルスロット番号を付与する
          if (update.item) {
            localItem = { ...update.item, slot: localSlot, raw: replaceSlotInSnbt(update.item.raw, localSlot) }
          }
          return transferSlotItem(owner, localSlot, localItem)
        })
      }

      return this.mutateContainer(update.containerId, (owner) =>
        transferSlotItem(owner, update.slot, update.item)
      )
    })
  }

  /**
   * スロット間でアイテムを移動（スワップ）する。
   *
   * @param move - 移動元・移動先スロット
   * @returns 更新後のコンテナ。失敗時は null
   */
  async moveSlot(move: SlotMove): Promise<ContainerRecord | null> {
    return this.runExclusive(async () => {
      // セッション未初期化時は移動できない
      if (!this.session) return null
      const containerIndex = this.session.containers.findIndex((e) => e.id === move.containerId)
      // 対象コンテナが見つからない場合は null を返す
      if (containerIndex < 0) return null
      const container = this.session.containers[containerIndex]

      // ラージチェストの場合は跨ぎ移動を処理する
      if (container.largeChest) {
        return this.mutateLargeChestMove(containerIndex, move.fromSlot, move.toSlot)
      }

      return this.mutateContainer(move.containerId, (owner) =>
        moveSlotInCompound(owner, move.fromSlot, move.toSlot)
      )
    })
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
    // セッション未初期化時は変更できない
    if (!this.session) {
      return null
    }

    const containerIndex = this.session.containers.findIndex((entry) => entry.id === containerId)
    // 対象コンテナが見つからない場合は null を返す
    if (containerIndex < 0) {
      return null
    }

    const container = this.session.containers[containerIndex]
    const binding = this.session.bindings.get(container.id)
    // binding が見つからない場合は変更できない
    if (!binding) {
      return null
    }

    // 編集対象リージョンを遅延ロードする
    await this.ensureRegionLoaded(binding.regionFile)
    const owner = resolveOwnerCompound(container, this.session, binding)
    // owner compound が見つからない場合は変更できない
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
   * ラージチェストの片側を変更し、マージ済みコンテナを再構築する。
   */
  private async mutateLargeChest(
    containerIndex: number,
    targetSlot: number,
    mutate: (owner: NbtCompound) => ItemStackView[]
  ): Promise<ContainerRecord | null> {
    // セッション未初期化時は変更対象がない
    if (!this.session) {
      return null
    }
    const container = this.session.containers[containerIndex]
    const pair = container.largeChest!
    const side = getHalfForSlot(targetSlot)
    let half: LargeChestHalf
    // 対象スロットが属する片側チェストを選ぶ
    if (side === 'primary') {
      half = pair.primary
    // secondary 側スロットの場合は secondary half を選ぶ
    } else {
      half = pair.secondary
    }

    await this.ensureRegionLoaded(half.regionFile)
    const owner = resolveOwnerForHalf(half, this.session)
    // owner が見つからない場合は変更できない
    if (!owner) {
      return null
    }

    mutate(owner)

    const binding = findBindingForHalf(half, this.session)
    // binding が見つかった場合だけ該当チャンクを dirty にする
    if (binding) {
      this.markChunkDirty(binding)
    }

    return this.rebuildLargeChestContainer(containerIndex)
  }

  /**
   * ラージチェストで両側にまたがる可能性のある move を処理する。
   */
  private async mutateLargeChestMove(
    containerIndex: number,
    fromSlot: number,
    toSlot: number
  ): Promise<ContainerRecord | null> {
    // セッション未初期化時は変更対象がない
    if (!this.session) {
      return null
    }
    // 移動元と移動先が同じ場合は現在のコンテナをそのまま返す
    if (fromSlot === toSlot) {
      return this.session.containers[containerIndex]
    }

    const container = this.session.containers[containerIndex]
    const pair = container.largeChest!
    const fromSide = getHalfForSlot(fromSlot)
    const toSide = getHalfForSlot(toSlot)

    // 同じ片側チェスト内の移動は単一 owner の更新で処理する
    if (fromSide === toSide) {
      return this.mutateLargeChest(containerIndex, fromSlot, (owner) =>
        moveSlotInCompound(owner, toLocalSlot(fromSlot), toLocalSlot(toSlot))
      )
    }

    // 別々の片側チェストにまたがる移動は両 owner を更新する
    let fromHalf: LargeChestHalf
    // 移動元スロットが属する片側チェストを選ぶ
    if (fromSide === 'primary') {
      fromHalf = pair.primary
    // secondary 側が移動元の場合
    } else {
      fromHalf = pair.secondary
    }

    let toHalf: LargeChestHalf
    // 移動先スロットが属する片側チェストを選ぶ
    if (toSide === 'primary') {
      toHalf = pair.primary
    // secondary 側が移動先の場合
    } else {
      toHalf = pair.secondary
    }

    await this.ensureRegionLoaded(fromHalf.regionFile)
    await this.ensureRegionLoaded(toHalf.regionFile)

    const fromOwner = resolveOwnerForHalf(fromHalf, this.session)
    const toOwner = resolveOwnerForHalf(toHalf, this.session)
    // 片側でも owner が見つからない場合は安全に移動できない
    if (!fromOwner || !toOwner) {
      return null
    }

    const localFrom = toLocalSlot(fromSlot)
    const localTo = toLocalSlot(toSlot)

    const fromItems = parseItemsList(getListItems(fromOwner, 'Items'))
    const toItems = parseItemsList(getListItems(toOwner, 'Items'))
    const fromItem = fromItems.find((i) => i.slot === localFrom) || null
    const toItem = toItems.find((i) => i.slot === localTo) || null

    // 移動元にアイテムがある場合は移動先 owner へ移す
    if (fromItem) {
      transferSlotItem(fromOwner, localFrom, null)
      const movedItem = { ...fromItem, slot: localTo, raw: replaceSlotInSnbt(fromItem.raw, localTo) }
      transferSlotItem(toOwner, localTo, movedItem)
    }
    // 移動先にアイテムがある場合は元スロットへ戻して入れ替える
    if (toItem) {
      transferSlotItem(toOwner, localTo, null)
      const movedBack = { ...toItem, slot: localFrom, raw: replaceSlotInSnbt(toItem.raw, localFrom) }
      transferSlotItem(fromOwner, localFrom, movedBack)
    }

    const fromBinding = findBindingForHalf(fromHalf, this.session)
    const toBinding = findBindingForHalf(toHalf, this.session)
    // 移動元チャンクの binding が見つかった場合は dirty にする
    if (fromBinding) {
      this.markChunkDirty(fromBinding)
    }
    // 移動先チャンクの binding が見つかった場合は dirty にする
    if (toBinding) {
      this.markChunkDirty(toBinding)
    }

    return this.rebuildLargeChestContainer(containerIndex)
  }

  /**
   * 両側の NBT を再読み込みしてマージ済みコンテナを再構築する。
   */
  private rebuildLargeChestContainer(containerIndex: number): ContainerRecord | null {
    // セッション未初期化時は再構築できない
    if (!this.session) {
      return null
    }
    const container = this.session.containers[containerIndex]
    const pair = container.largeChest!

    const primaryOwner = resolveOwnerForHalf(pair.primary, this.session)
    const secondaryOwner = resolveOwnerForHalf(pair.secondary, this.session)

    let primaryItems: ItemStackView[]
    // primary owner が見つかった場合だけ Items を読み直す
    if (primaryOwner) {
      primaryItems = parseItemsList(getListItems(primaryOwner, 'Items'))
    // primary owner が見つからない場合は空配列とする
    } else {
      primaryItems = []
    }

    let secondaryItems: ItemStackView[]
    // secondary owner が見つかった場合だけ Items を読み直す
    if (secondaryOwner) {
      secondaryItems = parseItemsList(getListItems(secondaryOwner, 'Items'))
    // secondary owner が見つからない場合は空配列とする
    } else {
      secondaryItems = []
    }

    const mergedItems: ItemStackView[] = [
      ...primaryItems,
      ...secondaryItems.map((item) => ({
        ...item,
        slot: item.slot + 27,
        raw: replaceSlotInSnbt(item.raw, item.slot + 27)
      }))
    ].sort((a, b) => a.slot - b.slot)

    const updated: ContainerRecord = {
      ...container,
      items: mergedItems
    }
    this.session.containers[containerIndex] = updated
    return updated
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
    // セッション未初期化時は保存できない
    if (!this.session) {
      logger.warn('session', '保存失敗: ワールド未読み込み')
      return { success: false, savedFiles: [], errors: ['ワールドが読み込まれていません。先にスキャンしてください。'] }
    }

    // 変更が無い場合は保存をスキップする
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
    // dirty リージョンをメモリ上の LoadedRegion に解決する
    for (const filePath of this.dirtyRegions) {
      const region = this.session.regions.get(filePath)
      // メモリ上に存在するリージョンだけ保存対象に追加する
      if (region !== undefined) {
        regionsToSave.push(region)
      }
    }

    // 保存対象リージョンを 1 件も解決できなかった場合は失敗する
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
    // 各リージョンの dirty chunk 情報を部分書き込み用に集める
    for (const region of regionsToSave) {
      const keys = this.dirtyChunkKeys.get(region.filePath)
      // dirty chunk が 1 件以上あるリージョンだけ登録する
      if (keys !== undefined && keys.size > 0) {
        dirtyChunksByRegion.set(region.filePath, keys)
      }
    }

    // 変更済みリージョンをディスクへ書き込む
    const report = await saveModifiedRegions(regionsToSave, onProgress, dirtyChunksByRegion)
    // 保存成功時は dirty 状態をクリアする
    if (report.success) {
      this.dirtyRegions.clear()
      this.dirtyChunkKeys.clear()
      logger.criticalInfo('session', '保存完了', {
        durationMs: Date.now() - startedAt,
        savedFileCount: report.savedFiles.length
      })
    // 一部失敗時は成功済みリージョンだけ dirty から外す
    } else {
      // 成功済みリージョンを dirty 集合から削除する
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
    // セッション未初期化時は null を返す
    if (this.session === null) {
      return null
    }
    return this.session.worldPath
  }
}
