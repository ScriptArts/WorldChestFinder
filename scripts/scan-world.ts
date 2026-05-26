import { scanWorld, toScanResult } from '../src/main/world/WorldScanner'

async function main(): Promise<void> {
  const worldPath = process.argv[2]
  if (!worldPath) {
    console.error('Usage: npx tsx scripts/scan-world.ts <worldPath>')
    process.exit(1)
  }

  const start = Date.now()
  const session = await scanWorld(worldPath, (p) => {
    if (p.phase === 'scan-finished' || p.phase === 'scan-discovery' || p.current % 25 === 0) {
      console.log(`[${p.current}/${p.total}] ${p.message}`)
    }
  })

  const result = toScanResult(session)
  const elapsed = ((Date.now() - start) / 1000).toFixed(1)

  console.log('\n=== Scan Result ===')
  console.log(`Containers: ${result.containers.length}`)
  console.log(`Errors: ${result.errors.length}`)
  console.log(`Elapsed: ${elapsed}s`)

  const byType: Record<string, number> = {}
  const byDim: Record<string, number> = {}
  for (const c of result.containers) {
    byType[c.sourceType] = (byType[c.sourceType] || 0) + 1
    byDim[c.dimension] = (byDim[c.dimension] || 0) + 1
  }
  console.log('By sourceType:', byType)
  console.log('By dimension:', byDim)

  const byBlock: Record<string, number> = {}
  for (const c of result.containers) {
    byBlock[c.blockEntityId] = (byBlock[c.blockEntityId] || 0) + 1
  }
  const topBlocks = Object.entries(byBlock).sort((a, b) => b[1] - a[1]).slice(0, 15)
  console.log('Top blockEntityId:', Object.fromEntries(topBlocks))

  const withItems = result.containers.filter((c) => c.items.length > 0)
  console.log(`Containers with items: ${withItems.length}`)

  if (withItems.length > 0) {
    console.log('\nSample containers:')
    for (const c of withItems.slice(0, 8)) {
      const itemSummary = c.items.map((i) => `${i.itemId}x${i.count}`).join(', ')
      console.log(`  ${c.blockEntityId} @ (${c.posX},${c.posY},${c.posZ}) [${c.dimension}/${c.sourceType}] -> ${itemSummary}`)
    }
  }

  if (result.errors.length > 0) {
    console.log('\nFirst errors:')
    for (const e of result.errors.slice(0, 5)) console.log(' ', e)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
