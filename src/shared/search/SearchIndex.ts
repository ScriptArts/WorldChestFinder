import type { ContainerRecord, ItemStackView, SearchFilter } from '../types'

/** 検索語を正規化する（小文字・trim） */
function normalizeTerm(term: string | undefined): string {
  if (term === undefined) {
    return ''
  }
  return term.trim().toLowerCase()
}

/** アイテム単位のフィルタ条件が指定されているか */
function hasItemLevelFilter(filter: SearchFilter): boolean {
  if (normalizeTerm(filter.query).length > 0) {
    // アイテム ID / 表示名の検索条件があればアイテム単位で絞り込む
    return true
  }
  if (normalizeTerm(filter.nbt).length > 0) {
    // NBT 検索条件があればアイテム単位で絞り込む
    return true
  }
  if (filter.minCount !== undefined) {
    // 最小数量条件があればアイテム単位で絞り込む
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
  const query = normalizeTerm(filter.query)
  const nbt = normalizeTerm(filter.nbt)

  if (query) {
    const idMatch =
      item.itemId.toLowerCase().includes(query) || item.displaySummary.toLowerCase().includes(query)
    if (!idMatch) {
      return false
    }
  }

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

  if (!hasItemLevelFilter(filter)) {
    return true
  }

  if (container.items.some((item) => itemMatchesFilter(item, filter))) {
    return true
  }

  const query = normalizeTerm(filter.query)
  const nbt = normalizeTerm(filter.nbt)
  // アイテム ID のみ指定時は Block Entity ID でもマッチさせる
  if (query && !nbt) {
    return container.blockEntityId.toLowerCase().includes(query)
  }

  return false
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
