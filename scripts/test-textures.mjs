import { accessSync, createWriteStream } from 'fs'
import { mkdir, readFile, rm, writeFile } from 'fs/promises'
import path from 'path'
import os from 'os'
import AdmZip from 'adm-zip'

const cacheRoot = path.join(os.tmpdir(), 'wcf-texture-test')
const vanillaRoot = path.join(cacheRoot, 'java', 'vanilla')
const MANIFEST_URL = 'https://launchermeta.mojang.com/mc/game/version_manifest.json'

function exists(p) {
  try { accessSync(p); return true } catch { return false }
}

async function fetchJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  return res.json()
}

async function downloadBuffer(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  return Buffer.from(await res.arrayBuffer())
}

function resolveItemTexture(packRoot, itemId) {
  const [ns, itemPath] = itemId.includes(':') ? itemId.split(':') : ['minecraft', itemId]
  const candidates = [
    path.join(packRoot, 'assets', ns, 'textures', 'item', `${itemPath}.png`),
    path.join(packRoot, 'assets', ns, 'textures', 'block', `${itemPath}.png`)
  ]
  for (const c of candidates) {
    if (exists(c)) return c
  }
  return null
}

console.log('Cache:', cacheRoot)
await mkdir(vanillaRoot, { recursive: true })

const manifest = await fetchJson(MANIFEST_URL)
const releaseId = manifest.latest.release
console.log('Release:', releaseId)

const versionEntry = manifest.versions.find(v => v.id === releaseId)
const versionJson = await fetchJson(versionEntry.url)
console.log('Downloading client.jar...')
const jar = await downloadBuffer(versionJson.downloads.client.url)

if (exists(vanillaRoot)) await rm(vanillaRoot, { recursive: true, force: true })
await mkdir(vanillaRoot, { recursive: true })

const zip = new AdmZip(jar)
let count = 0
for (const entry of zip.getEntries()) {
  if (entry.entryName.startsWith('assets/') && !entry.isDirectory) {
    zip.extractEntryTo(entry, vanillaRoot, true, true)
    count++
  }
}
console.log('Extracted asset files:', count)

const tests = ['minecraft:diamond', 'minecraft:iron_ingot', 'minecraft:chest', 'minecraft:gold_block']
let ok = 0
for (const id of tests) {
  const p = resolveItemTexture(vanillaRoot, id)
  if (p) {
    const buf = await readFile(p)
    const isPng = buf[0] === 0x89 && buf[1] === 0x50
    console.log(`OK  ${id} -> ${p} (${buf.length} bytes, png=${isPng})`)
    ok++
  } else {
    console.log(`NG  ${id} -> not found`)
  }
}

// world resources.zip
const worldZip = '/Users/scriptarts/Downloads/TheSkyBlessing/TheSkyBlessing/resources.zip'
if (exists(worldZip)) {
  const worldRoot = path.join(cacheRoot, 'world')
  if (exists(worldRoot)) await rm(worldRoot, { recursive: true, force: true })
  await mkdir(worldRoot, { recursive: true })
  new AdmZip(await readFile(worldZip)).extractAllTo(worldRoot, true)
  const custom = resolveItemTexture(worldRoot, 'minecraft:firework_star')
  console.log('World pack firework_star:', custom ?? 'not found (may use vanilla path)')
}

console.log(`\nResult: ${ok}/${tests.length} vanilla textures resolved`)
process.exit(ok === tests.length ? 0 : 1)
