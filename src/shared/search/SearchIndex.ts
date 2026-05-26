import type { ContainerRecord, ItemStackView, SearchFilter } from '../types'

/** 検索語を正規化する（小文字・trim） */
function normalizeTerm(term: string | undefined): string {
  if (term === undefined) {
    return ''
  }
  return term.trim().toLowerCase()
}

/** 座標フィルタが指定されているか */
function hasPosFilter(filter: SearchFilter): boolean {
  if (filter.posX !== undefined) {
    return true
  }
  if (filter.posY !== undefined) {
    return true
  }
  if (filter.posZ !== undefined) {
    return true
  }
  return false
}

/**
 * コンテナ座標が Pos 検索条件に一致するか判定する。
 *
 * @param container - 判定対象コンテナ
 * @param filter - 検索条件
 */
function matchesPosition(container: ContainerRecord, filter: SearchFilter): boolean {
  if (!hasPosFilter(filter)) {
    return true
  }
  if (!container.positionKnown) {
    // 座標不明のコンテナは Pos 指定時は除外する
    return false
  }
  if (filter.posX !== undefined && container.posX !== filter.posX) {
    return false
  }
  if (filter.posY !== undefined && container.posY !== filter.posY) {
    return false
  }
  if (filter.posZ !== undefined && container.posZ !== filter.posZ) {
    return false
  }
  return true
}

/** アイテム単位のフィルタ条件が指定されているか */
function hasItemLevelFilter(filter: SearchFilter): boolean {
  if (normalizeTerm(filter.nbt).length > 0) {
    // NBT 検索条件があればアイテム単位で絞り込む
    return true
  }
  if (filter.minCount !== undefined) {
    // 最小アイテム数条件があればアイテム単位で絞り込む
    return true
  }
  return false
}

/**
 * アイテム NBT が検索語に一致するか判定する。
 *
 * @param item - 判定対象アイテム
 * @param term - 正規化済み検索語（空なら常に true）
 * @returns 一致すれば true
 */
export function matchesNbt(item: ItemStackView, term: string): boolean {
  if (!term) {
    return true
  }
  return JSON.stringify(item.raw).toLowerCase().includes(term)
}

/**
 * 単一アイテムが SearchFilter に一致するか判定する。
 *
 * @param item - 判定対象
 * @param filter - 検索条件
 * @returns 一致すれば true
 */
export function itemMatchesFilter(item: ItemStackView, filter: SearchFilter): boolean {
  const nbt = normalizeTerm(filter.nbt)

  if (nbt && !matchesNbt(item, nbt)) {
    return false
  }

  if (filter.minCount !== undefined && item.count < filter.minCount) {
    return false
  }

  return true
}

/**
 * コンテナが SearchFilter に一致するか判定する。
 *
 * @param container - 判定対象コンテナ
 * @param filter - 検索条件
 * @returns 一致すれば true
 */
export function containerMatchesFilter(container: ContainerRecord, filter: SearchFilter): boolean {
  if (filter.dimension && container.dimension !== filter.dimension) {
    return false
  }
  if (filter.sourceType && container.sourceType !== filter.sourceType) {
    return false
  }
  if (!matchesPosition(container, filter)) {
    return false
  }

  if (!hasItemLevelFilter(filter)) {
    return true
  }

  return container.items.some((item) => itemMatchesFilter(item, filter))
}

/**
 * フィルタに一致するスロット番号一覧を返す。
 *
 * @param container - 対象コンテナ
 * @param filter - 検索条件
 * @returns 一致スロット番号の配列
 */
export function getMatchingSlots(container: ContainerRecord, filter?: SearchFilter): number[] {
  if (filter === undefined || !hasItemLevelFilter(filter)) {
    return []
  }

  return container.items.filter((item) => itemMatchesFilter(item, filter)).map((item) => item.slot)
}

/**
 * フィルタ条件に一致するコンテナだけを抽出する。
 *
 * @param containers - 全コンテナ
 * @param filter - 検索条件（省略時は全件）
 * @returns フィルタ後の配列
 */
export function filterContainers(containers: ContainerRecord[], filter?: SearchFilter): ContainerRecord[] {
  if (filter === undefined) {
    return containers
  }
  return containers.filter((container) => containerMatchesFilter(container, filter))
}
