import { readFile } from 'fs/promises'
import { gunzip } from 'zlib'
import { promisify } from 'util'
import path from 'path'
import nbt from 'prismarine-nbt'
import { formatError } from '../../shared/valueUtils'
import { buildWorldMetadata, type WorldMetadata } from '../../shared/world/WorldFormat'
import type { NbtCompound } from './nbtUtils'
import { getCompoundField, getInt, getString } from './nbtUtils'

const gunzipAsync = promisify(gunzip)

function extractDataCompound(root: NbtCompound): NbtCompound {
  const dataField = getCompoundField(root, 'Data')
  // 現行 level.dat は Data compound でラップされている
  if (dataField !== undefined && dataField.type === 'compound') {
    return dataField.value as NbtCompound
  }
  return root
}

function readVersionName(data: NbtCompound): string | null {
  const versionField = getCompoundField(data, 'Version')
  if (versionField === undefined || versionField.type !== 'compound') {
    return null
  }
  const versionCompound = versionField.value as NbtCompound
  const name = getString(versionCompound, 'Name')
  if (name === undefined || name.trim() === '') {
    return null
  }
  return name
}

/**
 * ワールド直下の level.dat からメタデータを読み取る。
 *
 * @param worldPath - ワールドディレクトリ
 */
export async function readWorldMetadata(worldPath: string): Promise<WorldMetadata> {
  const fallbackName = path.basename(worldPath)
  const levelDatPath = path.join(worldPath, 'level.dat')

  try {
    const buffer = await readFile(levelDatPath)
    let nbtBuffer: Buffer = buffer
    // gzip 圧縮されている場合は展開する
    if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
      nbtBuffer = await gunzipAsync(buffer) as Buffer
    }

    const parsed = await nbt.parse(nbtBuffer, 'big')
    const root = parsed.parsed.value as NbtCompound
    const data = extractDataCompound(root)

    let dataVersion = 0
    const dataVersionValue = getInt(data, 'DataVersion')
    if (dataVersionValue !== undefined) {
      dataVersion = dataVersionValue
    }

    let levelName = fallbackName
    const levelNameValue = getString(data, 'LevelName')
    if (levelNameValue !== undefined && levelNameValue.trim() !== '') {
      levelName = levelNameValue
    }

    const versionName = readVersionName(data)
    return buildWorldMetadata(dataVersion, versionName, levelName)
  } catch (error) {
    const metadata = buildWorldMetadata(0, null, fallbackName)
    return {
      ...metadata,
      supported: false,
      supportMessage: `level.dat を読み取れませんでした: ${formatError(error)}`
    }
  }
}
