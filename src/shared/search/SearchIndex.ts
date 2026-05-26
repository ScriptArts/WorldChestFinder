import type { ContainerRecord, ItemStackView, SearchFilter } from '../types'

/** 検索語を正規化する（小文字・trim） */
function normalizeTerm(term: string | undefined): string {
  // 未指定の検索語は空文字として扱う
  if (term === undefined) {
    return ''
  }
  return term.trim().toLowerCase()
}

/** 座標フィルタが指定されているか */
function hasPosFilter(filter: SearchFilter): boolean {
  // X 座標が指定されていれば座標フィルタあり
  if (filter.posX !== undefined) {
    return true
  }
  // Y 座標が指定されていれば座標フィルタあり
  if (filter.posY !== undefined) {
    return true
  }
  // Z 座標が指定されていれば座標フィルタあり
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
  // 座標条件がなければ常に一致とみなす
  if (!hasPosFilter(filter)) {
    return true
  }
  // 座標不明のコンテナは Pos 指定時は除外する
  if (!container.positionKnown) {
    return false
  }
  // X 座標が一致しない場合は除外する
  if (filter.posX !== undefined && container.posX !== filter.posX) {
    return false
  }
  // Y 座標が一致しない場合は除外する
  if (filter.posY !== undefined && container.posY !== filter.posY) {
    return false
  }
  // Z 座標が一致しない場合は除外する
  if (filter.posZ !== undefined && container.posZ !== filter.posZ) {
    return false
  }
  return true
}

/** アイテム単位のフィルタ条件が指定されているか */
function hasItemLevelFilter(filter: SearchFilter): boolean {
  // NBT 検索条件があればアイテム単位で絞り込む
  if (normalizeTerm(filter.nbt).length > 0) {
    return true
  }
  // 最小アイテム数条件があればアイテム単位で絞り込む
  if (filter.minCount !== undefined) {
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
  // 検索語が空なら NBT 条件は常に一致
  if (!term) {
    return true
  }
  // アイテム NBT を JSON 文字列化して部分一致を判定する
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

  // NBT 条件に一致しないアイテムは除外する
  if (nbt && !matchesNbt(item, nbt)) {
    return false
  }

  // 最小個数を下回るアイテムは除外する
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
  // ディメンションが一致しない場合は除外する
  if (filter.dimension && container.dimension !== filter.dimension) {
    return false
  }
  // ソース種別が一致しない場合は除外する
  if (filter.sourceType && container.sourceType !== filter.sourceType) {
    return false
  }
  // 座標条件に一致しない場合は除外する
  if (!matchesPosition(container, filter)) {
    return false
  }

  // アイテム単位の条件がなければコンテナ単位で一致
  if (!hasItemLevelFilter(filter)) {
    return true
  }

  // いずれかのアイテムが条件に一致すればコンテナ一致
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
  // アイテム単位フィルタがなければ一致スロットは返さない
  if (filter === undefined || !hasItemLevelFilter(filter)) {
    return []
  }

  // 一致アイテムのスロット番号だけを抽出する
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
  // フィルタ未指定なら全コンテナを返す
  if (filter === undefined) {
    return containers
  }
  // 条件に一致するコンテナだけを残す
  return containers.filter((container) => containerMatchesFilter(container, filter))
}
