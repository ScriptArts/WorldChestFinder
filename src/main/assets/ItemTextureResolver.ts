import { accessSync } from 'fs'
import { readFile } from 'fs/promises'
import path from 'path'
import { MinecraftIds } from '../../shared/minecraftIds'
import { getAssetPackRoots } from './ResourcePackManager'

interface ParsedItemId {
  namespace: string
  itemPath: string
}

function parseItemId(itemId: string): ParsedItemId {
  const separator = itemId.indexOf(':')
  // 名前空間区切りがない場合は minecraft を既定とする
  if (separator < 0) {
    return { namespace: 'minecraft', itemPath: itemId }
  }
  return {
    namespace: itemId.slice(0, separator),
    itemPath: itemId.slice(separator + 1)
  }
}

function pathExists(target: string): boolean {
  try {
    accessSync(target)
    return true
  } catch {
    return false
  }
}

async function readJsonFile(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await readFile(filePath, 'utf8')
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return null
  }
}

function readTextureValues(model: Record<string, unknown>): string[] {
  const textures = model.textures
  // textures フィールドが無効な場合は空配列を返す
  if (!textures || typeof textures !== 'object') {
    return []
  }

  const values: string[] = []
  // textures 内の各参照値を走査する
  for (const value of Object.values(textures as Record<string, unknown>)) {
    // 直接参照できるテクスチャだけ候補にする
    if (typeof value === 'string' && !value.startsWith('#')) {
      values.push(value)
    }
  }
  return values
}

function resolveFirstTextureValue(packRoot: string, namespace: string, values: string[]): string | null {
  // 候補 texture 参照を順番に解決する
  for (const value of values) {
    // モデル内の texture 参照を順番に解決する
    const resolved = resolveTexturePath(packRoot, namespace, value)
    // 解決できた最初のテクスチャを返す
    if (resolved) {
      return resolved
    }
  }
  return null
}

function normalizeTextureRef(ref: string): string {
  return ref.replace(/^minecraft:/, '').replace(/^#/, '')
}

function resolveTexturePath(packRoot: string, namespace: string, textureRef: string): string | null {
  const normalized = normalizeTextureRef(textureRef)
  const candidates = [
    path.join(packRoot, 'assets', namespace, 'textures', `${normalized}.png`),
    path.join(packRoot, 'assets', namespace, 'textures', 'item', `${normalized}.png`),
    path.join(packRoot, 'assets', namespace, 'textures', 'block', `${normalized}.png`),
    path.join(packRoot, 'assets', namespace, 'textures', 'entity', `${normalized}.png`)
  ]

  // 候補 PNG パスを順番に存在確認する
  for (const candidate of candidates) {
    // 最初に存在する PNG パスを採用する
    if (pathExists(candidate)) {
      return candidate
    }
  }

  return null
}

async function resolveFromModel(packRoot: string, parsed: ParsedItemId, visited: Set<string>): Promise<string | null> {
  const modelPath = path.join(
    packRoot,
    'assets',
    parsed.namespace,
    'models',
    'item',
    `${parsed.itemPath}.json`
  )

  // アイテムモデル JSON が存在しない場合は解決できない
  if (!pathExists(modelPath)) {
    return null
  }

  // 循環参照を防ぐため訪問済みモデルはスキップする
  if (visited.has(modelPath)) {
    return null
  }
  visited.add(modelPath)

  const model = await readJsonFile(modelPath)
  // モデル JSON の読み込みに失敗した場合は解決できない
  if (!model) {
    return null
  }

  const layer0 = model.layer0
  // layer0 直接参照からテクスチャを解決する
  if (typeof layer0 === 'string') {
    const resolved = resolveTexturePath(packRoot, parsed.namespace, layer0)
    // layer0 から解決できた場合は返す
    if (resolved) {
      return resolved
    }
  }

  const textureFromModel = resolveFirstTextureValue(packRoot, parsed.namespace, readTextureValues(model))
  // モデル内 textures から解決できた場合は返す
  if (textureFromModel) {
    return textureFromModel
  }

  const parent = model.parent
  // 親モデル参照がある場合は親からテクスチャを解決する
  if (typeof parent === 'string') {
    const parentRef = parent.replace(/^minecraft:/, '')
    const parentParts = parentRef.split('/')
    const parentType = parentParts[0]
    const parentName = parentParts.slice(1).join('/')

    const parentModelPath = path.join(
      packRoot,
      'assets',
      parsed.namespace,
      'models',
      parentType,
      `${parentName}.json`
    )

    // 親モデル JSON が存在する場合は textures を参照する
    if (pathExists(parentModelPath)) {
      const parentModel = await readJsonFile(parentModelPath)
      // 親モデルの読み込みに成功した場合
      if (parentModel) {
        const textureFromParent = resolveFirstTextureValue(packRoot, parsed.namespace, readTextureValues(parentModel))
        // 親モデルからテクスチャを解決できた場合は返す
        if (textureFromParent) {
          return textureFromParent
        }
      }
    }

    // チェスト系モデルの場合は entity テクスチャをフォールバックする
    if (parentRef.includes('template_chest') || parentRef.includes('chest')) {
      const entityChest = path.join(
        packRoot,
        'assets',
        parsed.namespace,
        'textures',
        'entity',
        'chest',
        'normal.png'
      )
      // チェスト entity テクスチャが存在すれば返す
      if (pathExists(entityChest)) {
        return entityChest
      }
    }
  }

  return null
}

async function resolveFromPackRoot(packRoot: string, parsed: ParsedItemId): Promise<string | null> {
  const directCandidates = [
    path.join(packRoot, 'assets', parsed.namespace, 'textures', 'item', `${parsed.itemPath}.png`),
    path.join(packRoot, 'assets', parsed.namespace, 'textures', 'block', `${parsed.itemPath}.png`),
    path.join(packRoot, 'assets', parsed.namespace, 'textures', 'entity', `${parsed.itemPath}.png`)
  ]

  // 直接配置された PNG 候補を順番に確認する
  for (const candidate of directCandidates) {
    // 直接配置された PNG が存在すれば返す
    if (pathExists(candidate)) {
      return candidate
    }
  }

  // シュルカーボックスは entity テクスチャを別途参照する
  if (parsed.itemPath.endsWith('_shulker_box')) {
    const shulkerColor = parsed.itemPath.replace('_shulker_box', '')
    const shulkerEntity = path.join(
      packRoot,
      'assets',
      parsed.namespace,
      'textures',
      'entity',
      'shulker',
      `shulker_${shulkerColor}.png`
    )
    // 色別シュルカー entity テクスチャが存在すれば返す
    if (pathExists(shulkerEntity)) {
      return shulkerEntity
    }
  }

  return resolveFromModel(packRoot, parsed, new Set<string>())
}

/**
 * アイテム ID からテクスチャ PNG の絶対パスを解決する。
 *
 * @param itemId - アイテム ID（例: minecraft:diamond）
 * @returns 見つかった PNG パス、または null
 */
export async function resolveItemTexture(itemId: string): Promise<string | null> {
  // 空または air アイテムはテクスチャ不要
  if (!itemId || itemId === MinecraftIds.ITEM_AIR) {
    return null
  }

  const parsed = parseItemId(itemId)
  const packRoots = getAssetPackRoots()

  // ワールド pack を優先するため末尾から走査する
  for (let index = packRoots.length - 1; index >= 0; index -= 1) {
    const resolved = await resolveFromPackRoot(packRoots[index], parsed)
    // 解決できた pack のテクスチャを返す
    if (resolved) {
      return resolved
    }
  }

  return null
}
