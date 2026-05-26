import { MinecraftIds } from '../../../../shared/minecraftIds'
import type { ContainerRecord } from '../../../../shared/types'

const CONTAINER_TITLES: Record<string, string> = {
  [MinecraftIds.BLOCK_CHEST]: 'Chest',
  [MinecraftIds.BLOCK_TRAPPED_CHEST]: 'Trapped Chest',
  [MinecraftIds.BLOCK_BARREL]: 'Barrel',
  [MinecraftIds.BLOCK_HOPPER]: 'Hopper',
  [MinecraftIds.BLOCK_DISPENSER]: 'Dispenser',
  [MinecraftIds.BLOCK_DROPPER]: 'Dropper',
  [MinecraftIds.BLOCK_FURNACE]: 'Furnace',
  [MinecraftIds.BLOCK_BLAST_FURNACE]: 'Blast Furnace',
  [MinecraftIds.BLOCK_SMOKER]: 'Smoker',
  [MinecraftIds.BLOCK_BREWING_STAND]: 'Brewing Stand',
  [MinecraftIds.BLOCK_SHULKER_BOX]: 'Shulker Box',
  [MinecraftIds.BLOCK_ENDER_CHEST]: 'Ender Chest',
  [MinecraftIds.ENTITY_CHEST_MINECART]: 'Minecart with Chest',
  [MinecraftIds.ENTITY_HOPPER_MINECART]: 'Minecart with Hopper'
}

/**
 * Block Entity ID を UI 表示用タイトルに変換する。
 * ラージチェストの場合は "Large Chest" と表示する。
 *
 * @param blockEntityId - コンテナ種別 ID
 * @param container - コンテナ情報（ラージチェスト判定用、省略可）
 */
export function formatContainerTitle(blockEntityId: string, container?: ContainerRecord): string {
  // ラージチェスト情報がある場合は通常チェストと表示名を分ける
  if (container !== undefined && container.largeChest !== undefined) {
    // トラップチェストのラージチェストは専用名で表示する
    if (blockEntityId === MinecraftIds.BLOCK_TRAPPED_CHEST) {
      return 'Large Trapped Chest'
    }
    return 'Large Chest'
  }

  // 既知のコンテナ ID は定義済みタイトルを使う
  if (CONTAINER_TITLES[blockEntityId]) {
    return CONTAINER_TITLES[blockEntityId]
  }
  let name = blockEntityId
  // 名前空間付き ID は表示名から名前空間を除外する
  if (blockEntityId.includes(':')) {
    name = blockEntityId.split(':')[1]
  }
  return name
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

/**
 * コンテナ種別に応じた ChestGrid の CSS クラスを返す。
 *
 * @param blockEntityId - コンテナ種別 ID
 * @param slotCount - スロット数
 */
export function getChestGridClass(blockEntityId: string, slotCount: number): string {
  // ホッパー系コンテナは横長グリッドを使う
  if (blockEntityId === MinecraftIds.BLOCK_HOPPER || blockEntityId === MinecraftIds.ENTITY_HOPPER_MINECART) {
    return 'mc-chest-grid mc-chest-grid--hopper'
  }
  // 1 スロット以下のコンテナは単独スロット用グリッドを使う
  if (slotCount <= 1) {
    return 'mc-chest-grid mc-chest-grid--single'
  }
  return 'mc-chest-grid'
}

/**
 * コンテナ種別に応じたウィンドウ枠の CSS クラスを返す。
 *
 * @param blockEntityId - コンテナ種別 ID
 * @param slotCount - スロット数
 */
export function getChestWindowClass(blockEntityId: string, slotCount: number): string {
  const compact =
    blockEntityId === MinecraftIds.BLOCK_HOPPER ||
    blockEntityId === MinecraftIds.ENTITY_HOPPER_MINECART ||
    slotCount <= 1
  // コンパクト表示が必要なコンテナは専用ウィンドウクラスを付ける
  if (compact) {
    return 'mc-chest-window mc-chest-window--compact'
  }
  return 'mc-chest-window'
}
