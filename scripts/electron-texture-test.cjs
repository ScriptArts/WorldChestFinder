const { app } = require('electron')
const path = require('path')

app.whenReady().then(async () => {
  try {
    const mod = await import('../out/main/index.js')
    // handlers not exported - import assets directly from source via dynamic path
    const rpm = await import('../out/main/chunks/ResourcePackManager.js').catch(() => null)
  } catch (e) {
    // bundled single file - use inline require of built assets
  }

  const { mkdir, readFile } = require('fs/promises')
  const { accessSync } = require('fs')
  const AdmZip = require('adm-zip')

  const userData = app.getPath('userData')
  console.log('userData:', userData)

  // Import TS compiled - electron-vite bundles to single index.js
  // Use electron to load our handlers by spawning IPC simulation
  
  const { ensureVanillaAssets, loadWorldResourcePack, getAssetPackRoots } = require('../out/main/index.js')
})
