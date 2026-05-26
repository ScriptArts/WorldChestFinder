import { copyFile, mkdir, mkdtemp, rm, stat } from 'fs/promises'
import os from 'os'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { AppSession } from '../src/main/AppSession'
import { itemAtSlot } from './testUtils'

const TEST_WORLD = '/Users/scriptarts/Downloads/TheSkyBlessing/TheSkyBlessing'

describe('DnD save flow', () => {
  it('moveSlot marks dirty and save writes to disk', async () => {
    const sourceRegion = path.join(TEST_WORLD, 'region', 'r.-1.-1.mca')
    const worldPath = await mkdtemp(path.join(os.tmpdir(), 'wcf-dnd-save-'))
    const regionFile = path.join(worldPath, 'region', 'r.-1.-1.mca')
    await mkdir(path.dirname(regionFile), { recursive: true })
    await copyFile(sourceRegion, regionFile)

    const session = new AppSession()
    const scan = await session.scan(worldPath)
    const target = scan.containers.find((c) => c.items.length > 0)!
    const fromSlot = 11
    const toSlot = 0
    const fromItem = itemAtSlot(target.items, fromSlot)
    const toItem = itemAtSlot(target.items, toSlot)
    expect(fromItem).toBeDefined()
    expect(toItem).toBeDefined()
    expect(fromItem!.itemId).not.toBe(toItem!.itemId)

    const moved = await session.moveSlot({
      containerId: target.id,
      fromSlot,
      toSlot
    })
    expect(moved).not.toBeNull()
    expect(itemAtSlot(moved!.items, toSlot)!.itemId).toBe(fromItem!.itemId)
    expect(itemAtSlot(moved!.items, fromSlot)!.itemId).toBe(toItem!.itemId)

    expect(session.getSaveStatus().pendingRegionCount).toBe(1)

    const beforeMtime = (await stat(regionFile)).mtimeMs
    const save = await session.saveChanges()
    expect(save.success).toBe(true)
    expect(save.savedFiles).toHaveLength(1)
    expect(session.getSaveStatus().pendingRegionCount).toBe(0)

    const afterMtime = (await stat(regionFile)).mtimeMs
    expect(afterMtime).toBeGreaterThan(beforeMtime)

    const verify = await new AppSession().scan(worldPath)
    const match = verify.containers.find(
      (c) => c.posX === target.posX && c.posY === target.posY && c.posZ === target.posZ
    )
    expect(match).toBeDefined()
    expect(itemAtSlot(match!.items, toSlot)!.itemId).toBe(fromItem!.itemId)
    expect(itemAtSlot(match!.items, fromSlot)!.itemId).toBe(toItem!.itemId)

    await rm(worldPath, { recursive: true, force: true })
  }, 120_000)

  it('rejects rescan while changes are unsaved', async () => {
    const sourceRegion = path.join(TEST_WORLD, 'region', 'r.-1.-1.mca')
    const worldPath = await mkdtemp(path.join(os.tmpdir(), 'wcf-rescan-dirty-'))
    const regionFile = path.join(worldPath, 'region', 'r.-1.-1.mca')
    await mkdir(path.dirname(regionFile), { recursive: true })
    await copyFile(sourceRegion, regionFile)

    try {
      const session = new AppSession()
      const scan = await session.scan(worldPath)
      const target = scan.containers.find((c) => c.items.length > 0)!
      const item = target.items[0]

      const updated = await session.updateSlot({
        containerId: target.id,
        slot: item.slot,
        item: {
          ...item,
          count: item.count + 1,
          raw: { ...item.raw, Count: item.count + 1 }
        }
      })
      expect(updated).not.toBeNull()
      await expect(session.scan(worldPath)).rejects.toThrow('未保存の変更があります。保存してから再スキャンしてください。')
    } finally {
      await rm(worldPath, { recursive: true, force: true })
    }
  }, 120_000)
})
