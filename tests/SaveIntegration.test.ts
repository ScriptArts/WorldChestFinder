import { copyFile, mkdir, mkdtemp, readdir, rm, stat } from 'fs/promises'
import os from 'os'
import path from 'path'
import nbt from 'prismarine-nbt'
import { describe, expect, it } from 'vitest'
import { AppSession } from '../src/main/AppSession'
import { readRegion, writeRegion } from '../src/main/world/AnvilRegionReader'
import { findItemsHits, hitsToContainers } from '../src/main/world/ItemsLocator'
import { updateSlotInCompound } from '../src/main/world/NbtEditor'
import { parseItemsList } from '../src/main/world/ItemStackParser'
import { saveModifiedRegions } from '../src/main/world/SaveCoordinator'
import { getInt, getIntFirst, getListItems } from '../src/main/world/nbtUtils'
import type { ContainerRecord, SaveProgress } from '../src/shared/types'
import { itemAtSlot } from './testUtils'
import type { NbtCompound } from '../src/main/world/nbtUtils'

const TEST_WORLD = '/Users/scriptarts/Downloads/TheSkyBlessing/TheSkyBlessing'

async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target)
    return true
  } catch {
    return false
  }
}

async function regionHasChest(regionFile: string): Promise<boolean> {
  try {
    const region = await readRegion(regionFile)
    for (const chunk of region.chunks.values()) {
      const hits = findItemsHits(chunk.nbt)
      if (hits.some((hit) => hit.sourceType === 'block_entity')) {
        return true
      }
    }
  } catch {
    return false
  }
  return false
}

async function listMcaFiles(root: string): Promise<string[]> {
  const results: string[] = []

  async function walk(current: string): Promise<void> {
    let entries
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath)
        continue
      }
      if (entry.isFile() && entry.name.endsWith('.mca') && entry.name.startsWith('r.')) {
        results.push(fullPath)
      }
    }
  }

  await walk(root)
  return results.sort()
}

async function findRegionWithChest(worldPath: string): Promise<string | null> {
  const preferredDirs = [path.join(worldPath, 'region'), worldPath]

  for (const dir of preferredDirs) {
    if (!(await pathExists(dir))) {
      continue
    }

    for (const regionFile of await listMcaFiles(dir)) {
      if (await regionHasChest(regionFile)) {
        return regionFile
      }
    }
  }

  return null
}

async function createSingleRegionWorld(sourceRegion: string): Promise<{
  worldPath: string
  regionFile: string
  cleanup: () => Promise<void>
}> {
  const worldPath = await mkdtemp(path.join(os.tmpdir(), 'wcf-save-test-'))
  const regionDir = path.join(worldPath, 'region')
  await mkdir(regionDir, { recursive: true })

  const regionFile = path.join(regionDir, path.basename(sourceRegion))
  await copyFile(sourceRegion, regionFile)

  return {
    worldPath,
    regionFile,
    cleanup: async () => {
      await rm(worldPath, { recursive: true, force: true })
    }
  }
}

function sameContainer(left: ContainerRecord, right: ContainerRecord): boolean {
  return left.posX === right.posX && left.posY === right.posY && left.posZ === right.posZ
}

async function readItemCountFromRegion(
  regionFile: string,
  target: ContainerRecord,
  slot: number
): Promise<number | undefined> {
  const region = await readRegion(regionFile)
  for (const chunk of region.chunks.values()) {
    let chunkX = getInt(chunk.nbt, 'xPos')
    if (chunkX === undefined) {
      chunkX = target.chunkX
    }
    let chunkZ = getInt(chunk.nbt, 'zPos')
    if (chunkZ === undefined) {
      chunkZ = target.chunkZ
    }
    const hits = findItemsHits(chunk.nbt)
    const containers = hitsToContainers(hits, {
      dimension: target.dimension,
      regionFile,
      chunkX,
      chunkZ
    })
    const match = containers.find((container) => sameContainer(container, target))
    if (match) {
      const item = itemAtSlot(match.items, slot)
      if (item !== undefined) {
        return item.count
      }
    }
  }
  return undefined
}

async function newestBackup(regionFile: string): Promise<string | null> {
  const dir = path.dirname(regionFile)
  const base = path.basename(regionFile)
  const entries = await readdir(dir)
  const backups = entries
    .filter((name) => name.startsWith(`${base}.bak.`))
    .map((name) => path.join(dir, name))
    .sort()

  if (backups.length === 0) {
    return null
  }
  return backups[backups.length - 1]
}

function compoundCoord(compound: NbtCompound, lowerKey: string, upperKey: string): number | undefined {
  return getIntFirst(compound, lowerKey, upperKey)
}

function changedCount(originalCount: number, preferredCount: number): number {
  if (originalCount === preferredCount) {
    return preferredCount + 1
  }
  return preferredCount
}

describe('save pipeline (TheSkyBlessing)', () => {
  it('returns error when no world is loaded', async () => {
    const session = new AppSession()
    const report = await session.saveChanges()
    expect(report.success).toBe(false)
    expect(report.errors).toContain('ワールドが読み込まれていません。先にスキャンしてください。')
  })

  it('modified chunk survives writeRegion', async () => {
    if (!(await pathExists(TEST_WORLD))) {
      throw new Error(`Test world not found: ${TEST_WORLD}`)
    }

    const sourceRegion = path.join(TEST_WORLD, 'region', 'r.-1.-1.mca')
    const tempWorld = await createSingleRegionWorld(sourceRegion)
    try {
      const region = await readRegion(tempWorld.regionFile)
      for (const chunk of region.chunks.values()) {
        for (const hit of findItemsHits(chunk.nbt)) {
          const x = compoundCoord(hit.ownerCompound, 'x', 'X')
          const y = compoundCoord(hit.ownerCompound, 'y', 'Y')
          const z = compoundCoord(hit.ownerCompound, 'z', 'Z')
          if (x === -162 && y === 134 && z === -350) {
            const items = parseItemsList(getListItems(hit.ownerCompound, 'Items'))
            const item = items.find((entry) => entry.slot === 0)
            if (item) {
              updateSlotInCompound(hit.ownerCompound, 0, { ...item, count: 42, raw: { ...item.raw, Count: 42 } })
            }
          }
        }
      }

      const chunk = region.chunks.get('21,10')!
      const serialized = await nbt.writeUncompressed({ name: '', type: 'compound', value: chunk.nbt }, 'big')
      await expect(nbt.parse(serialized, 'big')).resolves.toBeDefined()

      await writeRegion(region)
      const after = await readRegion(tempWorld.regionFile)
      expect(after.chunks.has('21,10')).toBe(true)
      expect(after.chunks.size).toBe(region.chunks.size)
    } finally {
      await tempWorld.cleanup()
    }
  }, 120_000)

  it('round-trips an unchanged copied region file', async () => {
    if (!(await pathExists(TEST_WORLD))) {
      throw new Error(`Test world not found: ${TEST_WORLD}`)
    }

    const sourceRegion = await findRegionWithChest(TEST_WORLD)
    if (!sourceRegion) {
      throw new Error(`No chest region found in ${TEST_WORLD}`)
    }

    const tempWorld = await createSingleRegionWorld(sourceRegion)
    try {
      const originalRegion = await readRegion(tempWorld.regionFile)
      const progressEvents: SaveProgress[] = []
      const saveReport = await saveModifiedRegions([originalRegion], (progress) => {
        progressEvents.push(progress)
      })

      expect(saveReport.success).toBe(true)
      expect(saveReport.savedFiles).toEqual([tempWorld.regionFile])
      const lastProgress = progressEvents[progressEvents.length - 1]
      expect(lastProgress.phase).toBe('save-finished')

      const reloaded = await readRegion(tempWorld.regionFile)
      expect(reloaded.chunks.size).toBe(originalRegion.chunks.size)
    } finally {
      await tempWorld.cleanup()
    }
  }, 120_000)

  it('scan -> edit -> save persists item count on copied region', async () => {
    if (!(await pathExists(TEST_WORLD))) {
      throw new Error(`Test world not found: ${TEST_WORLD}`)
    }

    const sourceRegion = await findRegionWithChest(TEST_WORLD)
    if (!sourceRegion) {
      throw new Error(`No chest region found in ${TEST_WORLD}`)
    }

    const tempWorld = await createSingleRegionWorld(sourceRegion)
    try {
      const session = new AppSession()
      const scanResult = await session.scan(tempWorld.worldPath)
      expect(scanResult.containers.length).toBeGreaterThan(0)

      const target = scanResult.containers.find((container) => container.items.length > 0)
      if (!target) {
        throw new Error('No container with items found in copied region')
      }

      const item = target.items[0]
      const originalCount = item.count
      let nextCount = 42
      if (originalCount === 42) {
        nextCount = 43
      }

      const updated = await session.updateSlot({
        containerId: target.id,
        slot: item.slot,
        item: {
          ...item,
          count: nextCount,
          raw: { ...item.raw, Count: nextCount }
        }
      })
      expect(updated).not.toBeNull()
      expect(itemAtSlot(updated!.items, item.slot)!.count).toBe(nextCount)

      const progressEvents: SaveProgress[] = []
      const saveReport = await session.saveChanges((progress) => {
        progressEvents.push(progress)
      })

      expect(saveReport.success).toBe(true)
      expect(saveReport.savedFiles).toContain(tempWorld.regionFile)
      expect(progressEvents.some((event) => event.phase === 'save-region')).toBe(true)

      const verifySession = new AppSession()
      const verifyScan = await verifySession.scan(tempWorld.worldPath)
      expect(verifyScan.containers.length).toBe(scanResult.containers.length)
      const verifyContainer = verifyScan.containers.find((container) => sameContainer(container, target))
      expect(verifyContainer).toBeDefined()
      expect(itemAtSlot(verifyContainer!.items, item.slot)!.count).toBe(nextCount)

      const persisted = await readItemCountFromRegion(tempWorld.regionFile, target, item.slot)
      expect(persisted).toBe(nextCount)

      const backup = await newestBackup(tempWorld.regionFile)
      expect(backup).not.toBeNull()
      if (backup) {
        await copyFile(backup, tempWorld.regionFile)
      }

      const restored = await readItemCountFromRegion(tempWorld.regionFile, target, item.slot)
      expect(restored).toBe(originalCount)
    } finally {
      await tempWorld.cleanup()
    }
  }, 180_000)

  it('keeps the first saved chunk after a second partial save in the same session', async () => {
    if (!(await pathExists(TEST_WORLD))) {
      throw new Error(`Test world not found: ${TEST_WORLD}`)
    }

    const sourceRegion = await findRegionWithChest(TEST_WORLD)
    if (!sourceRegion) {
      throw new Error(`No chest region found in ${TEST_WORLD}`)
    }

    const tempWorld = await createSingleRegionWorld(sourceRegion)
    try {
      const session = new AppSession()
      const scanResult = await session.scan(tempWorld.worldPath)
      const firstTarget = scanResult.containers.find((container) => container.items.length > 0)
      if (!firstTarget) {
        throw new Error('No first container with items found in copied region')
      }

      const secondTarget = scanResult.containers.find((container) => {
        // 2 回目の部分保存で別チャンクを更新できる対象を探す
        if (container.items.length === 0) {
          return false
        }
        if (container.chunkX === firstTarget.chunkX && container.chunkZ === firstTarget.chunkZ) {
          return false
        }
        return true
      })
      if (!secondTarget) {
        throw new Error('No second container in a different chunk found in copied region')
      }

      const firstItem = firstTarget.items[0]
      const secondItem = secondTarget.items[0]
      const firstCount = changedCount(firstItem.count, 51)
      const secondCount = changedCount(secondItem.count, 52)

      // 1 回目の保存で最初のチャンクを変更する
      const firstUpdated = await session.updateSlot({
        containerId: firstTarget.id,
        slot: firstItem.slot,
        item: {
          ...firstItem,
          count: firstCount,
          raw: { ...firstItem.raw, Count: firstCount }
        }
      })
      expect(firstUpdated).not.toBeNull()
      const firstSave = await session.saveChanges()
      expect(firstSave.success).toBe(true)

      // 2 回目の保存で別チャンクだけを dirty として変更する
      const secondUpdated = await session.updateSlot({
        containerId: secondTarget.id,
        slot: secondItem.slot,
        item: {
          ...secondItem,
          count: secondCount,
          raw: { ...secondItem.raw, Count: secondCount }
        }
      })
      expect(secondUpdated).not.toBeNull()
      const secondSave = await session.saveChanges()
      expect(secondSave.success).toBe(true)

      const persistedFirst = await readItemCountFromRegion(tempWorld.regionFile, firstTarget, firstItem.slot)
      const persistedSecond = await readItemCountFromRegion(tempWorld.regionFile, secondTarget, secondItem.slot)
      expect(persistedFirst).toBe(firstCount)
      expect(persistedSecond).toBe(secondCount)
    } finally {
      await tempWorld.cleanup()
    }
  }, 180_000)
})
