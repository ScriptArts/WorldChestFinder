/** prismarine-nbt 互換の NBT タグ */
export type NbtTag = {
  type: string
  value: unknown
  name?: string
}

/** キー名 → NBT タグ の compound マップ */
export type NbtCompound = Record<string, NbtTag>
