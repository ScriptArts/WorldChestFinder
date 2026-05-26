import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { registerIpcHandlers, initializeAssets } from './ipc/handlers'
import { initLogger, installProcessErrorHandlers, logger } from './logging/AppLogger'

/**
 * メインウィンドウを作成し、レンダラーを読み込む。
 */
function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1500,
    height: 900,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // 開発時は Vite dev server、本番はビルド済み HTML
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    logger.info('app', '開発サーバーからレンダラーを読み込み', {
      url: process.env.ELECTRON_RENDERER_URL
    })
  } else {
    const htmlPath = join(__dirname, '../renderer/index.html')
    mainWindow.loadFile(htmlPath)
    logger.info('app', 'ビルド済みレンダラーを読み込み', { htmlPath })
  }

  // 外部リンクは既定ブラウザで開く
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    logger.debug('app', '外部リンクを開く', { url })
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    logger.error('app', 'レンダラー読み込み失敗', {
      errorCode,
      errorDescription,
      validatedURL
    })
  })
}

app.whenReady().then(async () => {
  installProcessErrorHandlers()
  const logsDirectory = await initLogger()
  logger.info('app', 'アプリケーション起動', {
    version: app.getVersion(),
    packaged: app.isPackaged,
    platform: process.platform,
    appPath: app.getAppPath(),
    userDataPath: app.getPath('userData'),
    logsDirectory
  })

  registerIpcHandlers()
  createWindow()

  // 起動時にバニラ assets をバックグラウンド取得
  initializeAssets().catch((error) => {
    logger.error('assets', '起動時 assets 初期化失敗', { error: String(error) })
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      logger.info('app', 'ウィンドウを再作成')
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    logger.info('app', '全ウィンドウ終了のためアプリを終了')
    app.quit()
  }
})

app.on('before-quit', () => {
  logger.info('app', 'アプリケーション終了')
})
