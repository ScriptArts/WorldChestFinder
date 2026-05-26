import { app } from 'electron'
import { readFile } from 'fs/promises'
import { ensureVanillaAssets, loadWorldResourcePack, getAssetPackRoots } from '../src/main/assets/ResourcePackManager'
import { resolveItemTexture } from '../src/main/assets/ItemTextureResolver'

async function verifyPng(filePath: string): Promise<boolean> {
  const buf = await readFile(filePath)
  return buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50
}

app.whenReady().then(async () => {
  console.log('=== WorldChestFinder Texture Test ===')
  console.log('userData:', app.getPath('userData'))

  await ensureVanillaAssets((p) => console.log(`[assets ${p.current}/${p.total}] ${p.message}`))
  console.log('pack roots:', getAssetPackRoots())

  const vanillaItems = [
    'minecraft:diamond',
    'minecraft:iron_ingot',
    'minecraft:gold_block',
    'minecraft:chest',
    'minecraft:firework_star'
  ]

  let ok = 0
  for (const itemId of vanillaItems) {
    const texturePath = await resolveItemTexture(itemId)
    if (!texturePath) {
      console.log('NG', itemId, '(not resolved)')
      continue
    }
    const valid = await verifyPng(texturePath)
    console.log(valid ? 'OK' : 'NG', itemId, texturePath)
    if (valid) ok += 1
  }

  const world = '/Users/scriptarts/Downloads/TheSkyBlessing/TheSkyBlessing'
  const loaded = await loadWorldResourcePack(world, (p) => console.log(`[world] ${p.message}`))
  console.log('world pack loaded:', loaded)

  if (loaded) {
    const after = getAssetPackRoots()
    console.log('pack roots with world:', after)
    const worldItems = ['minecraft:firework_star', 'minecraft:gold_ingot', 'minecraft:nether_star']
    for (const itemId of worldItems) {
      const texturePath = await resolveItemTexture(itemId)
      if (!texturePath) {
        console.log('NG', itemId, '(after world pack)')
        continue
      }
      const valid = await verifyPng(texturePath)
      console.log(valid ? 'OK' : 'NG', itemId, '(world)', texturePath)
      if (valid) ok += 1
    }
  }

  console.log(`\nTotal resolved PNGs: ${ok}`)
  app.exit(ok >= 4 ? 0 : 1)
}).catch((error) => {
  console.error(error)
  app.exit(1)
})
