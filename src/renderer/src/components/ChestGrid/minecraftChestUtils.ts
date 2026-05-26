const CONTAINER_TITLES: Record<string, string> = {
  'minecraft:chest': 'Chest',
  'minecraft:trapped_chest': 'Trapped Chest',
  'minecraft:barrel': 'Barrel',
  'minecraft:hopper': 'Hopper',
  'minecraft:dispenser': 'Dispenser',
  'minecraft:dropper': 'Dropper',
  'minecraft:furnace': 'Furnace',
  'minecraft:blast_furnace': 'Blast Furnace',
  'minecraft:smoker': 'Smoker',
  'minecraft:brewing_stand': 'Brewing Stand',
  'minecraft:shulker_box': 'Shulker Box',
  'minecraft:ender_chest': 'Ender Chest',
  'minecraft:chest_minecart': 'Minecart with Chest',
  'minecraft:hopper_minecart': 'Minecart with Hopper'
}

/**
 * Block Entity ID を UI 表示用タイトルに変換する。
 *
 * @param blockEntityId - コンテナ種別 ID
 */
export function formatContainerTitle(blockEntityId: string): string {
  if (CONTAINER_TITLES[blockEntityId]) {
    return CONTAINER_TITLES[blockEntityId]
  }

  let name = blockEntityId
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
  if (blockEntityId === 'minecraft:hopper' || blockEntityId === 'minecraft:hopper_minecart') {
    return 'mc-chest-grid mc-chest-grid--hopper'
  }
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
    blockEntityId === 'minecraft:hopper' ||
    blockEntityId === 'minecraft:hopper_minecart' ||
    slotCount <= 1
  if (compact) {
    return 'mc-chest-window mc-chest-window--compact'
  }
  return 'mc-chest-window'
}
