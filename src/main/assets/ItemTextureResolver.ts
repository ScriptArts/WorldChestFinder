import { accessSync } from 'fs'
import { readFile } from 'fs/promises'
import path from 'path'
import { MinecraftIds } from '../../shared/minecraftIds'
import { getAssetPackRoots } from './ResourcePackManager'

interface ParsedItemId {
  namespace: string
  itemPath: string
}

interface ParsedModelRef {
  namespace: string
  modelType: string
  modelName: string
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

function parseModelRef(modelRef: string): ParsedModelRef | null {
  let namespace = 'minecraft'
  let pathPart = modelRef
  const separator = modelRef.indexOf(':')
  // 名前空間付き参照を分解する
  if (separator >= 0) {
    namespace = modelRef.slice(0, separator)
    pathPart = modelRef.slice(separator + 1)
  }

  const parts = pathPart.split('/')
  // block/tnt 形式でない参照は解釈できない
  if (parts.length < 2) {
    return null
  }

  return {
    namespace,
    modelType: parts[0],
    modelName: parts.slice(1).join('/')
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
  let textureNamespace = namespace
  let texturePathPart = textureRef
  const separator = textureRef.indexOf(':')
  // テクスチャ参照に名前空間が含まれる場合はそれを優先する
  if (separator >= 0) {
    textureNamespace = textureRef.slice(0, separator)
    texturePathPart = textureRef.slice(separator + 1)
  }

  const normalized = normalizeTextureRef(texturePathPart)
  const candidates = [
    path.join(packRoot, 'assets', textureNamespace, 'textures', `${normalized}.png`),
    path.join(packRoot, 'assets', textureNamespace, 'textures', 'item', `${normalized}.png`),
    path.join(packRoot, 'assets', textureNamespace, 'textures', 'block', `${normalized}.png`),
    path.join(packRoot, 'assets', textureNamespace, 'textures', 'entity', `${normalized}.png`)
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

function buildModelFilePath(packRoot: string, parsed: ParsedModelRef): string {
  return path.join(
    packRoot,
    'assets',
    parsed.namespace,
    'models',
    parsed.modelType,
    `${parsed.modelName}.json`
  )
}

function extractFirstModelReference(node: unknown): string | null {
  // 非オブジェクトは走査対象外
  if (!node || typeof node !== 'object') {
    return null
  }

  const record = node as Record<string, unknown>
  // minecraft:model 定義から model 参照を取得する
  if (record.type === 'minecraft:model' && typeof record.model === 'string') {
    return record.model
  }

  // 子要素を再帰的に走査して最初の model 参照を探す
  for (const value of Object.values(record)) {
    const found = extractFirstModelReference(value)
    if (found !== null) {
      return found
    }
  }

  return null
}

async function resolveFromModelFile(
  packRoot: string,
  modelFilePath: string,
  defaultNamespace: string,
  visited: Set<string>
): Promise<string | null> {
  // 循環参照を防ぐため訪問済みモデルはスキップする
  if (visited.has(modelFilePath)) {
    return null
  }
  visited.add(modelFilePath)

  // モデル JSON が存在しない場合は解決できない
  if (!pathExists(modelFilePath)) {
    return null
  }

  const model = await readJsonFile(modelFilePath)
  // モデル JSON の読み込みに失敗した場合は解決できない
  if (!model) {
    return null
  }

  const layer0 = model.layer0
  // layer0 直接参照からテクスチャを解決する
  if (typeof layer0 === 'string') {
    const resolved = resolveTexturePath(packRoot, defaultNamespace, layer0)
    // layer0 から解決できた場合は返す
    if (resolved) {
      return resolved
    }
  }

  const textureFromModel = resolveFirstTextureValue(packRoot, defaultNamespace, readTextureValues(model))
  // モデル内 textures から解決できた場合は返す
  if (textureFromModel) {
    return textureFromModel
  }

  const parent = model.parent
  // 親モデル参照がある場合は親からテクスチャを解決する
  if (typeof parent === 'string') {
    const parentRef = parent.replace(/^minecraft:/, '')
    // builtin 親はファイルを持たないためスキップする
    if (parentRef.startsWith('builtin/')) {
      return null
    }

    const parsedParent = parseModelRef(parent)
    // 親参照を解釈できた場合は親モデルを再帰的に辿る
    if (parsedParent) {
      const parentModelPath = buildModelFilePath(packRoot, parsedParent)
      const textureFromParent = await resolveFromModelFile(
        packRoot,
        parentModelPath,
        parsedParent.namespace,
        visited
      )
      if (textureFromParent) {
        return textureFromParent
      }
    }

    // チェスト系モデルの場合は entity テクスチャをフォールバックする
    if (parentRef.includes('template_chest') || parentRef.includes('chest')) {
      const entityChest = path.join(
        packRoot,
        'assets',
        defaultNamespace,
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

async function resolveFromModelReference(
  packRoot: string,
  modelRef: string,
  visited: Set<string>
): Promise<string | null> {
  const parsed = parseModelRef(modelRef)
  // モデル参照を解釈できない場合は解決できない
  if (!parsed) {
    return null
  }

  const modelFilePath = buildModelFilePath(packRoot, parsed)
  return resolveFromModelFile(packRoot, modelFilePath, parsed.namespace, visited)
}

async function resolveFromItemDefinition(
  packRoot: string,
  parsed: ParsedItemId,
  visited: Set<string>
): Promise<string | null> {
  const itemDefinitionPath = path.join(
    packRoot,
    'assets',
    parsed.namespace,
    'items',
    `${parsed.itemPath}.json`
  )

  // 1.21.4+ の item 定義が無い場合は旧形式へフォールバックする
  if (!pathExists(itemDefinitionPath)) {
    return null
  }

  const itemDefinition = await readJsonFile(itemDefinitionPath)
  // item 定義の読み込みに失敗した場合は解決できない
  if (!itemDefinition) {
    return null
  }

  const modelReference = extractFirstModelReference(itemDefinition.model)
  // model 参照が取れない場合は解決できない
  if (modelReference === null) {
    return null
  }

  return resolveFromModelReference(packRoot, modelReference, visited)
}

async function resolveFromLegacyItemModel(
  packRoot: string,
  parsed: ParsedItemId,
  visited: Set<string>
): Promise<string | null> {
  const legacyModelRef = `${parsed.namespace}:item/${parsed.itemPath}`
  return resolveFromModelReference(packRoot, legacyModelRef, visited)
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

  const visited = new Set<string>()

  const fromItemDefinition = await resolveFromItemDefinition(packRoot, parsed, visited)
  if (fromItemDefinition) {
    return fromItemDefinition
  }

  return resolveFromLegacyItemModel(packRoot, parsed, visited)
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
