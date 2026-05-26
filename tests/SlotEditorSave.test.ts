import { copyFile, mkdir, mkdtemp, rm, stat } from 'fs/promises'
import os from 'os'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { AppSession } from '../src/main/AppSession'
import { itemAtSlot } from './testUtils'

const TEST_WORLD = '/Users/scriptarts/Downloads/TheSkyBlessing/TheSkyBlessing'

function itemFromRaw(slot: number, itemId: string, count: number, raw: Record<string, unknown>) {
  return {
    slot,
    itemId,
    count,
    displaySummary: '',
    raw: { ...raw, Slot: slot, id: itemId, count }
  }
}

describe('save via SlotEditor flow', () => {
  it('persists after apply + save on copied world', async () => {
    const sourceRegion = path.join(TEST_WORLD, 'region', 'r.-1.-1.mca')
    const worldPath = await mkdtemp(path.join(os.tmpdir(), 'wcf-sloteditor-'))
    const regionFile = path.join(worldPath, 'region', 'r.-1.-1.mca')
    await mkdir(path.dirname(regionFile), { recursive: true })
    await copyFile(sourceRegion, regionFile)

    const session = new AppSession()
    const scan = await session.scan(worldPath)
    const target = scan.containers.find((c) => c.items.length > 0)!
    const item = target.items[0]
    const raw = { ...item.raw }
    delete raw.Count

    const updated = await session.updateSlot({
      containerId: target.id,
      slot: item.slot,
      item: itemFromRaw(item.slot, item.itemId, 42, raw)
    })
    expect(updated).not.toBeNull()

    const beforeMtime = (await stat(regionFile)).mtimeMs
    const save = await session.saveChanges()
    expect(save.success).toBe(true)
    expect(save.savedFiles).toHaveLength(1)

    const afterMtime = (await stat(regionFile)).mtimeMs
    expect(afterMtime).toBeGreaterThan(beforeMtime)

    const verify = await new AppSession().scan(worldPath)
    const match = verify.containers.find(
      (c) => c.posX === target.posX && c.posY === target.posY && c.posZ === target.posZ
    )
    expect(match).toBeDefined()
    expect(itemAtSlot(match!.items, item.slot)!.count).toBe(42)

    await rm(worldPath, { recursive: true, force: true })
  }, 120_000)
})
