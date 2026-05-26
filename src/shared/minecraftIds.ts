/**
 * Minecraft の名前空間付き ID を集約する定数クラス。
 *
 * @remarks
 * ブロック・エンティティ・アイテム・コンポーネントの固有 ID は直接文字列で書かず、このクラスを参照する。
 */
export class MinecraftIds {
  /** 空スロットを表すアイテム ID */
  static readonly ITEM_AIR = 'minecraft:air'

  /** 通常チェストのブロックエンティティ ID */
  static readonly BLOCK_CHEST = 'minecraft:chest'
  /** トラップチェストのブロックエンティティ ID */
  static readonly BLOCK_TRAPPED_CHEST = 'minecraft:trapped_chest'
  /** 樽のブロックエンティティ ID */
  static readonly BLOCK_BARREL = 'minecraft:barrel'
  /** ホッパーのブロックエンティティ ID */
  static readonly BLOCK_HOPPER = 'minecraft:hopper'
  /** ディスペンサーのブロックエンティティ ID */
  static readonly BLOCK_DISPENSER = 'minecraft:dispenser'
  /** ドロッパーのブロックエンティティ ID */
  static readonly BLOCK_DROPPER = 'minecraft:dropper'
  /** かまどのブロックエンティティ ID */
  static readonly BLOCK_FURNACE = 'minecraft:furnace'
  /** 溶鉱炉のブロックエンティティ ID */
  static readonly BLOCK_BLAST_FURNACE = 'minecraft:blast_furnace'
  /** 燻製器のブロックエンティティ ID */
  static readonly BLOCK_SMOKER = 'minecraft:smoker'
  /** 醸造台のブロックエンティティ ID */
  static readonly BLOCK_BREWING_STAND = 'minecraft:brewing_stand'
  /** シュルカーボックスのブロックエンティティ ID */
  static readonly BLOCK_SHULKER_BOX = 'minecraft:shulker_box'
  /** エンダーチェストのブロックエンティティ ID */
  static readonly BLOCK_ENDER_CHEST = 'minecraft:ender_chest'

  /** チェスト付きトロッコのエンティティ ID */
  static readonly ENTITY_CHEST_MINECART = 'minecraft:chest_minecart'
  /** ホッパー付きトロッコのエンティティ ID */
  static readonly ENTITY_HOPPER_MINECART = 'minecraft:hopper_minecart'

  /** カスタム名コンポーネント ID */
  static readonly COMPONENT_CUSTOM_NAME = 'minecraft:custom_name'
  /** 耐久値ダメージコンポーネント ID */
  static readonly COMPONENT_DAMAGE = 'minecraft:damage'
}
