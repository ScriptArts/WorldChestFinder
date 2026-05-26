import type { ContainerRecord } from './types'

/**
 * コンテナ座標の表示文字列を返す。
 *
 * @param container - 表示対象コンテナ
 * @returns 座標が判明していれば座標文字列、不明なら「座標不明」
 */
export function formatContainerPosition(container: ContainerRecord): string {
  // 座標が判明している場合のみ座標文字列を組み立てる
  if (container.positionKnown) {
    // NBT から座標を取得できた場合だけ座標値を表示する
    return `(${container.posX}, ${container.posY}, ${container.posZ})`
  }
  return '座標不明'
}
