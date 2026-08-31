import { useEffect, useMemo, useRef, useState } from 'react'
import { FolderOpen, Save, Search } from 'lucide-react'
import type { SearchFilter } from '../../shared/types'
import { isSearchFilterActive } from '../../shared/search/SearchIndex'
import { buildWorldMetadata, createWorldFormat } from '../../shared/world/WorldFormat'
import { coalesce, formatError } from '../../shared/valueUtils'
import { ChestGrid } from './components/ChestGrid'
import { ConfirmDialog } from './components/ConfirmDialog'
import { ScanErrorDialog } from './components/ScanErrorDialog'
import { ContainerList } from './components/ContainerList'
import { OperationProgressBar } from './components/OperationProgressBar'
import { SearchBar } from './components/SearchBar'
import { SlotEditor } from './components/SlotEditor'
import { Badge } from './components/ui/badge'
import { Button } from './components/ui/button'
import { Separator } from './components/ui/separator'
import { useWorldChestStore } from './hooks/useWorldChestStore'

const MIN_PROGRESS_VISIBLE_MS = 500

/**
 * プログレスバーを最低表示時間だけ表示し続ける。
 *
 * @param startedAt - 操作開始時刻（Date.now）
 */
function waitForProgressVisibility(startedAt: number): Promise<void> {
  const elapsed = Date.now() - startedAt
  const remaining = MIN_PROGRESS_VISIBLE_MS - elapsed
  // 最低表示時間を満たしていれば待機不要
  if (remaining <= 0) {
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    window.setTimeout(resolve, remaining)
  })
}

/** ステータスバーに出すワールドパスの最大文字数 */
const STATUS_BAR_PATH_MAX_LENGTH = 44

/**
 * ステータスバー表示用にワールドパスを短縮する。
 *
 * @remarks
 * どのワールドを開いているかは末尾のフォルダ名で判断するため、
 * 末尾を優先して残し、あふれる先頭側を `…` で省略する。
 *
 * @param path - 表示対象のパス
 * @returns 上限に収まるよう先頭を省略したパス
 */
function formatStatusBarPath(path: string): string {
  // 上限に収まるならそのまま表示する
  if (path.length <= STATUS_BAR_PATH_MAX_LENGTH) {
    return path
  }

  const segments = path.split(/[/\\]/).filter((segment) => segment !== '')
  // 区切りが無いパスは末尾側だけを切り出す
  if (segments.length === 0) {
    return `…${path.slice(-STATUS_BAR_PATH_MAX_LENGTH)}`
  }

  let separator = '/'
  // Windows のパスは区切り文字を元のまま保つ
  if (path.includes('\\')) {
    separator = '\\'
  }

  // 最低でも末尾フォルダ名は残す
  let shortened = `…${separator}${segments[segments.length - 1]}`
  // 末尾から順に親フォルダを足し、上限を超える手前で打ち切る
  for (let index = segments.length - 2; index >= 0; index -= 1) {
    const candidate = `…${separator}${segments.slice(index).join(separator)}`
    // 上限を超えたら 1 つ前の候補を採用する
    if (candidate.length > STATUS_BAR_PATH_MAX_LENGTH) {
      break
    }
    shortened = candidate
  }
  return shortened
}

/** 通知帯の共通クラス（左端 2px の色帯 + 1 行分の高さ） */
const SAVE_NOTICE_BASE_CLASS =
  'flex shrink-0 items-center border-b border-l-2 border-b-border px-3 py-1.5 text-[12px] leading-snug'

/**
 * 保存結果バナーの Tailwind クラスを種別に応じて返す。
 *
 * @param kind - success / error / info
 */
function getSaveNoticeClassName(kind: 'success' | 'error' | 'info'): string {
  // 成功通知用のスタイルを返す
  if (kind === 'success') {
    return `${SAVE_NOTICE_BASE_CLASS} border-l-success bg-success/10 text-success`
  }
  // エラー通知用のスタイルを返す
  if (kind === 'error') {
    return `${SAVE_NOTICE_BASE_CLASS} border-l-destructive bg-destructive/10 text-destructive`
  }
  return `${SAVE_NOTICE_BASE_CLASS} border-l-primary bg-primary/10 text-foreground`
}

/** メインソフトウェア（ワールド選択・スキャン・編集・保存） */
export default function App(): JSX.Element {
  const [isScanning, setIsScanning] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isMovingSlot, setIsMovingSlot] = useState(false)
  const [saveNotice, setSaveNotice] = useState<{ kind: 'success' | 'error' | 'info'; message: string } | null>(null)
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false)
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false)
  const [scanErrorDialogOpen, setScanErrorDialogOpen] = useState(false)
  const [scanErrors, setScanErrors] = useState<string[]>([])
  const [containerSummary, setContainerSummary] = useState<{
    displayed: number
    total: number
    filterActive: boolean
  } | null>(null)

  const {
    worldPath,
    assetsStatus,
    assetProgress,
    progress,
    saveProgress,
    saveStatus,
    containers,
    selectedContainerId,
    selectedSlot,
    filter,
    statusMessage,
    setWorldPath,
    setAssetsStatus,
    setAssetProgress,
    scanResult,
    setScanResult,
    setProgress,
    setSaveProgress,
    setSaveStatus,
    setContainers,
    selectContainer,
    selectSlot,
    setFilter,
    setStatusMessage,
    updateContainer
  } = useWorldChestStore()

  useEffect(() => {
    const unsubscribeScan = window.worldChest.onScanProgress((nextProgress) => {
      setProgress(nextProgress)
    })
    const unsubscribeSave = window.worldChest.onSaveProgress((nextProgress) => {
      setSaveProgress(nextProgress)
    })
    const unsubscribeAssets = window.worldChest.onAssetDownloadProgress((nextProgress) => {
      setAssetProgress(nextProgress)
      // スキャン中でなければ assets 進捗をステータスへ反映する
      if (!isScanning) {
        setStatusMessage(nextProgress.message)
      }
    })

    // 起動時にバニラ assets の準備状態を取得する
    window.worldChest.ensureAssets().then((status) => {
      setAssetsStatus(status)
      // assets 準備完了時にバージョン情報を表示する
      if (status.ready) {
        const versionLabel = coalesce(status.vanillaVersion, 'cached')
        setStatusMessage(`バニラ assets 準備完了 (${versionLabel})`)
      }
    }).catch((error) => {
      setStatusMessage(`assets 取得エラー: ${formatError(error)}`)
    })

    return () => {
      unsubscribeScan()
      unsubscribeSave()
      unsubscribeAssets()
    }
  }, [isScanning, setAssetProgress, setAssetsStatus, setProgress, setSaveProgress, setStatusMessage])

  const selectedContainer = useMemo(() => {
    const found = containers.find((entry) => entry.id === selectedContainerId)
    // 選択 ID に一致するコンテナがなければ null
    if (found === undefined) {
      return null
    }
    return found
  }, [containers, selectedContainerId])

  const selectedContainerIdRef = useRef<string | null>(selectedContainerId)
  useEffect(() => {
    // 非同期操作完了時に現在の選択先を参照するため ref に同期する
    selectedContainerIdRef.current = selectedContainerId
  }, [selectedContainerId])

  const loadProgress = useMemo(() => {
    // スキャン進捗があればそれを優先表示する
    if (progress !== null) {
      return progress
    }
    // スキャン中なら assets ダウンロード進捗を表示する
    if (isScanning && assetProgress !== null) {
      return assetProgress
    }
    return null
  }, [progress, isScanning, assetProgress])

  const isBusy = isScanning || isSaving || isMovingSlot

  async function refreshSaveStatus(): Promise<void> {
    // メインプロセスから最新の保存状態を取得する
    const status = await window.worldChest.getSaveStatus()
    setSaveStatus(status)
  }

  function showSaveNotice(kind: 'success' | 'error' | 'info', message: string): void {
    setSaveNotice({ kind, message })
    setStatusMessage(message)
  }

  function clearWorldPreview(path: string): void {
    setWorldPath(path)
    setScanResult({
      worldPath: path,
      worldMetadata: buildWorldMetadata(0, null, path.split(/[/\\]/).pop() || path, false),
      containers: [],
      errors: []
    })
    setContainers([])
    setContainerSummary(null)
  }

  function resetLoadedWorldPreview(): void {
    setWorldPath(null)
    setScanResult(null)
    setContainers([])
    setContainerSummary(null)
  }

  function isSelectedContainer(containerId: string): boolean {
    // 非同期操作開始時と同じコンテナが選択されている場合だけ true を返す
    if (selectedContainerIdRef.current === containerId) {
      return true
    }
    return false
  }

  useEffect(() => {
    // 初期表示時に保存状態を取得する
    void refreshSaveStatus().catch((error) => {
      setStatusMessage(`保存状態の取得に失敗しました: ${formatError(error)}`)
    })
  }, [])

  useEffect(() => {
    // 通知がなければ自動消去タイマーを設定しない
    if (!saveNotice) {
      return
    }
    const timer = window.setTimeout(() => setSaveNotice(null), 8000)
    return () => window.clearTimeout(timer)
  }, [saveNotice])

  async function openWorldSelector(): Promise<void> {
    // ファイルダイアログでワールドパスを選択する
    const path = await window.worldChest.selectWorld()
    // パスが選ばれたらプレビュー状態を初期化する
    if (path) {
      clearWorldPreview(path)
      setStatusMessage(`Selected: ${path}`)
    }
  }

  async function handleSelectWorld(): Promise<void> {
    // 未保存変更がある場合は破棄確認ダイアログを表示する
    if (saveStatus.pendingRegionCount > 0) {
      setDiscardConfirmOpen(true)
      return
    }
    await openWorldSelector()
  }

  function handleCancelDiscardConfirm(): void {
    setDiscardConfirmOpen(false)
  }

  async function handleConfirmDiscardAndSelectWorld(): Promise<void> {
    setDiscardConfirmOpen(false)
    try {
      // メモリ上の未保存変更を破棄してからワールド選択へ進む
      const status = await window.worldChest.discardUnsavedChanges()
      setSaveStatus(status)
      resetLoadedWorldPreview()
      await openWorldSelector()
    } catch (error) {
      const message = `未保存変更の破棄に失敗しました: ${formatError(error)}`
      showSaveNotice('error', message)
    }
  }

  async function applySearchFilter(nextFilter: SearchFilter): Promise<void> {
    setFilter(nextFilter)
    const filterActive = isSearchFilterActive(nextFilter)
    const allContainersPromise = window.worldChest.getContainers({})
    // 検索条件ありの場合は一致一覧も並行取得する
    if (filterActive) {
      const matchedContainersPromise = window.worldChest.getContainers(nextFilter)
      const matchedContainers = await matchedContainersPromise
      const allContainers = await allContainersPromise
      setContainers(matchedContainers)
      setContainerSummary({
        displayed: matchedContainers.length,
        total: allContainers.length,
        filterActive: true
      })
      return
    }

    const allContainers = await allContainersPromise
    setContainers(allContainers)
    setContainerSummary({
      displayed: allContainers.length,
      total: allContainers.length,
      filterActive: false
    })
  }

  async function handleSearch(nextFilter: SearchFilter): Promise<void> {
    await applySearchFilter(nextFilter)
  }

  async function handleScan(): Promise<void> {
    // ワールド未選択ならスキャンを開始しない
    if (!worldPath) {
      setStatusMessage('先にワールドを選択してください')
      return
    }
    // 未保存変更がある場合は再スキャンを拒否する
    if (saveStatus.pendingRegionCount > 0) {
      const message = '未保存の変更があります。保存してから再スキャンしてください'
      showSaveNotice('info', message)
      return
    }

    setIsScanning(true)
    setProgress({
      phase: 'scan-start',
      current: 0,
      total: 1,
      message: 'ワールドを読み込んでいます...'
    })
    setStatusMessage('スキャン中...')
    const startedAt = Date.now()

    try {
      // ワールド全体をスキャンする
      const result = await window.worldChest.scanWorld(worldPath)
      setScanResult(result)
      const nextStatus = await window.worldChest.getAssetsStatus()
      setAssetsStatus(nextStatus)
      await applySearchFilter(filter)
      // スキャン完了後に保存状態を同期する
      await refreshSaveStatus()
      setStatusMessage(`スキャン完了: ${result.containers.length} コンテナ (${result.errors.length} エラー) / MC ${createWorldFormat(result.worldMetadata).versionLabel}`)
      // 読み込み失敗があれば完了後に詳細ダイアログを表示する
      if (result.errors.length > 0) {
        setScanErrors(result.errors)
        setScanErrorDialogOpen(true)
      } else {
        setScanErrors([])
        setScanErrorDialogOpen(false)
      }
    } catch (error) {
      const message = `スキャンに失敗しました: ${formatError(error)}`
      showSaveNotice('error', message)
    } finally {
      await waitForProgressVisibility(startedAt)
      setIsScanning(false)
      setProgress(null)
    }
  }

  function handleCloseScanErrorDialog(): void {
    setScanErrorDialogOpen(false)
  }

  async function handleSave(): Promise<void> {
    const status = await window.worldChest.getSaveStatus()
    setSaveStatus(status)

    // ワールド未読込では保存を開始しない
    if (!status.worldLoaded) {
      showSaveNotice('info', '先にワールドをスキャンしてください')
      return
    }
    // 未変更なら保存ボタン相当の処理を即終了する
    if (status.pendingRegionCount === 0) {
      showSaveNotice('info', '保存する変更がありません。スロットを編集してから保存してください')
      return
    }
    // 二重保存を防ぐ
    if (isSaving) {
      return
    }

    // 保存前にバックアップ推奨の確認ダイアログを表示する
    setSaveConfirmOpen(true)
  }

  function handleCancelSaveConfirm(): void {
    setSaveConfirmOpen(false)
  }

  async function handleConfirmSave(): Promise<void> {
    setSaveConfirmOpen(false)

    const status = await window.worldChest.getSaveStatus()
    setSaveStatus(status)

    // 確認中に保存対象がなくなった場合は保存を中止する
    if (!status.worldLoaded || status.pendingRegionCount === 0) {
      showSaveNotice('info', '保存する変更がありません。スロットを編集してから保存してください')
      return
    }
    // 確認中に別操作で保存が始まっていた場合は中止する
    if (isSaving) {
      return
    }

    setIsSaving(true)
    setSaveProgress({
      phase: 'save-start',
      current: 0,
      total: status.pendingRegionCount,
      message: `${status.pendingRegionCount} 件のリージョンを保存しています...`
    })
    setStatusMessage('保存中...')
    const startedAt = Date.now()

    try {
      // 変更済みリージョンをワールドへ書き込む
      const report = await window.worldChest.saveChanges()
      // 保存成功後に未保存件数を同期する
      await refreshSaveStatus()

      // 保存対象がなければ案内メッセージを表示する
      if (report.nothingToSave) {
        const message = '保存する変更がありません。スロットを編集してから保存してください'
        showSaveNotice('info', message)
      // 保存成功時は完了メッセージを表示する
      } else if (report.success) {
        const message = `保存完了: ${report.savedFiles.length} リージョンファイルを書き込みました`
        showSaveNotice('success', message)
      // 保存失敗時はエラー内容を表示する
      } else {
        const message = `保存エラー: ${report.errors.join(' / ')}`
        showSaveNotice('error', message)
      }
    } catch (error) {
      const message = `保存に失敗しました: ${formatError(error)}`
      showSaveNotice('error', message)
    } finally {
      await waitForProgressVisibility(startedAt)
      setIsSaving(false)
      setSaveProgress(null)
    }
  }

  const worldFormat = useMemo(() => {
    if (scanResult === null) {
      return null
    }
    return createWorldFormat(scanResult.worldMetadata)
  }, [scanResult])

  const worldWritable = scanResult !== null && scanResult.worldMetadata.supported

  /** 検索フィルタのディメンション候補は、スキャン結果に実在する次元 ID から作る */
  const dimensionOptions = useMemo(() => {
    // スキャン前は候補を出さない
    if (scanResult === null) {
      return []
    }
    const found = new Set<string>()
    // コンテナが属する次元 ID を重複なく集める
    for (const container of scanResult.containers) {
      found.add(container.dimension)
    }
    return [...found].sort()
  }, [scanResult])

  const assetsReady = assetsStatus !== null && assetsStatus.ready
  const canScan = worldPath !== null && assetsReady && !isBusy && saveStatus.pendingRegionCount === 0
  let canSave = !isBusy && saveStatus.worldLoaded && saveStatus.pendingRegionCount > 0 && worldWritable

  /*
   * ツールバー上で強調されるボタンは常に 1 つだけにする。
   * 未保存の変更があるときは「保存」、それ以外で走査可能なときは「スキャン」を主操作とする。
   */
  let scanButtonVariant: 'default' | 'secondary' = 'secondary'
  let saveButtonVariant: 'default' | 'outline' = 'outline'
  // 未保存の変更があるときは保存を主操作にする
  if (saveStatus.pendingRegionCount > 0) {
    saveButtonVariant = 'default'
  // 走査可能なときはスキャンを主操作にする
  } else if (canScan) {
    scanButtonVariant = 'default'
  }

  let saveButtonLabel = '保存'
  // 保存中はラベルを進行中表示に切り替える
  if (isSaving) {
    saveButtonLabel = '保存中...'
  }

  let worldPathLabel = '未選択'
  // ワールドパスが選ばれていればそのパスを表示する
  if (worldPath !== null) {
    worldPathLabel = worldPath
  }

  let worldNameLabel = ''
  // ワールドパスからフォルダ名だけを取り出してツールバーへ表示する
  if (worldPath !== null) {
    worldNameLabel = worldPath.split(/[/\\]/).filter((segment) => segment !== '').pop() || worldPath
  }

  let vanillaVersionLabel = 'cached'
  // バニラバージョンが取得できていれば表示名を差し替える
  if (assetsStatus !== null && assetsStatus.vanillaVersion !== null) {
    vanillaVersionLabel = assetsStatus.vanillaVersion
  }

  let worldVersionLabel = ''
  let worldDataVersionLabel = ''
  /*
   * ワールド選択直後は level.dat 未読込のプレビュー（DataVersion 0）が入っている。
   * この状態のバージョンは「不明」であって「非対応」ではないため、スキャン済みのときだけ表示する。
   */
  if (worldFormat !== null && worldFormat.dataVersion > 0) {
    worldVersionLabel = worldFormat.versionLabel
    worldDataVersionLabel = String(worldFormat.dataVersion)
  }

  // 書き込み非対応のワールドはバージョン表示自体を警告色にする
  let worldVersionToneClass = 'text-foreground'
  if (!worldWritable) {
    worldVersionToneClass = 'text-destructive'
  }

  let worldVersionTitle = 'このワールド形式は編集・保存に対応しています'
  // 非対応形式のときはツールチップで理由を伝える
  if (!worldWritable) {
    worldVersionTitle = 'このワールド形式は編集・保存に対応していません'
  }

  async function moveSelectedSlot(fromSlot: number, toSlot: number): Promise<void> {
    // 操作中は DnD の重複 IPC を送らない
    if (!selectedContainer || isBusy || isMovingSlot) {
      return
    }

    const targetContainerId = selectedContainer.id
    setIsMovingSlot(true)
    try {
      // メインプロセスへスロット移動を依頼する
      const updated = await window.worldChest.moveSlot({
        containerId: targetContainerId,
        fromSlot,
        toSlot
      })
      // 移動成功時のみ UI を更新する
      if (updated) {
        // DnD 中に別コンテナへ切り替わっていない場合だけ画面へ反映する
        if (isSelectedContainer(targetContainerId)) {
          updateContainer(updated)
          await refreshSaveStatus()
          selectSlot(toSlot)
          setStatusMessage(`Slot ${fromSlot} → ${toSlot} に移動（未保存）`)
        }
      // 移動失敗時はエラーメッセージを表示する
      } else {
        setStatusMessage('スロットの移動に失敗しました。再スキャンしてからお試しください')
      }
    } finally {
      setIsMovingSlot(false)
    }
  }

  async function handleSlotUpdated(container: NonNullable<typeof selectedContainer>, targetSlot: number | undefined): Promise<void> {
    // 操作中に到着した古い更新結果は UI へ反映しない
    if (isBusy) {
      return
    }
    updateContainer(container)
    await refreshSaveStatus()
    // 移動先スロットが指定されていれば選択を追従させる
    if (targetSlot !== undefined) {
      selectSlot(targetSlot)
    }

    let message = `Slot ${selectedSlot} を更新しました（未保存）`
    // スロット番号が変わった場合は移動メッセージに差し替える
    if (targetSlot !== undefined && targetSlot !== selectedSlot) {
      message = `Slot ${selectedSlot} → ${targetSlot} に移動（未保存）`
    }
    setStatusMessage(message)
  }

  return (
    <div className="grid h-screen min-h-0 grid-rows-[auto_auto_1fr_auto] overflow-hidden bg-background">
      {/* ツールバー: 主要操作と編集対象のワールド名だけを置く */}
      <header className="flex h-9 shrink-0 items-center gap-1 border-b border-border-strong bg-chrome px-1.5">
        <Button type="button" variant="secondary" onClick={handleSelectWorld} disabled={isBusy}>
          <FolderOpen />
          ワールド選択
        </Button>
        <Separator orientation="vertical" className="mx-1 h-4 bg-border-strong" />
        <Button type="button" variant={scanButtonVariant} onClick={handleScan} disabled={!canScan}>
          <Search />
          スキャン
        </Button>
        <Button type="button" variant={saveButtonVariant} onClick={handleSave} disabled={!canSave}>
          <Save />
          {saveButtonLabel}
        </Button>

        {saveStatus.pendingRegionCount > 0 && (
          <Badge variant="selection" className="ml-1">
            <span className="size-1.5 rounded-full bg-selection" aria-hidden />
            未保存 {saveStatus.pendingRegionCount}
          </Badge>
        )}

        <div className="ml-auto flex min-w-0 items-center gap-2 pr-1">
          {worldNameLabel === '' && (
            <span className="text-[12px] text-muted-foreground">ワールド未選択</span>
          )}
          {worldNameLabel !== '' && (
            <span className="truncate text-[12px] font-medium text-chrome-foreground" title={worldPathLabel}>
              {worldNameLabel}
            </span>
          )}
        </div>
      </header>

      {/* 通知帯と進捗帯。どちらも無ければ高さ 0 になる */}
      <div className="shrink-0">
        {saveNotice && (
          <div className={getSaveNoticeClassName(saveNotice.kind)} role="status">
            {saveNotice.message}
          </div>
        )}

        {isScanning && loadProgress !== null && (
          <OperationProgressBar title="ワールド読み込み" progress={loadProgress} />
        )}
        {isSaving && saveProgress !== null && (
          <OperationProgressBar title="ワールド保存" progress={saveProgress} />
        )}
      </div>

      <ConfirmDialog
        open={saveConfirmOpen}
        title="ワールドを保存しますか？"
        description={'保存処理によってワールドデータが破損する可能性があります。\n保存前にワールドフォルダのバックアップを取ることを強く推奨します。'}
        confirmLabel="保存する"
        cancelLabel="キャンセル"
        onConfirm={() => {
          void handleConfirmSave()
        }}
        onCancel={handleCancelSaveConfirm}
      />

      <ConfirmDialog
        open={discardConfirmOpen}
        title="未保存の変更を破棄しますか？"
        description={'未保存の変更があります。\n破棄して別のワールドを選択してもよろしいですか？'}
        confirmLabel="破棄して選択"
        cancelLabel="キャンセル"
        onConfirm={() => {
          void handleConfirmDiscardAndSelectWorld()
        }}
        onCancel={handleCancelDiscardConfirm}
      />

      <ScanErrorDialog
        open={scanErrorDialogOpen}
        errors={scanErrors}
        onClose={handleCloseScanErrorDialog}
      />

      <main className="relative grid min-h-0 gap-2 overflow-hidden p-2 lg:grid-cols-[340px_1fr]">
        {isBusy && (
          <div
            className="absolute inset-0 z-10 cursor-wait bg-background/55"
            aria-hidden
          />
        )}

        {/* 左: 検索条件とヒットしたコンテナの一覧 */}
        <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
          <div className="micro shrink-0 border-b border-border bg-muted px-3 py-2 text-muted-foreground">
            検索条件
          </div>
          <div className="shrink-0 p-2.5">
            <SearchBar appliedFilter={filter} dimensions={dimensionOptions} onSearch={handleSearch} disabled={isBusy} />
          </div>
          <ContainerList
            containers={containers}
            selectedId={selectedContainerId}
            containerSummary={containerSummary}
            onSelect={selectContainer}
            disabled={isBusy}
          />
        </aside>

        {/* 右: チェスト GUI と選択スロットの NBT エディタ */}
        <section className="flex h-full min-h-0 w-full flex-col gap-2 overflow-hidden">
          <div className="flex shrink-0 justify-center overflow-auto rounded-lg border border-border bg-muted px-3 py-4 shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)]">
            <ChestGrid
              container={selectedContainer}
              selectedSlot={selectedSlot}
              onSelectSlot={selectSlot}
              disabled={isBusy || !worldWritable}
              onMoveSlot={moveSelectedSlot}
            />
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            <SlotEditor
              container={selectedContainer}
              slot={selectedSlot}
              worldFormat={worldFormat}
              disabled={isBusy || !worldWritable}
              onUpdated={handleSlotUpdated}
              onError={setStatusMessage}
            />
          </div>
        </section>
      </main>

      {/* ステータスバー: 直近の状況と読み込み済みデータの素性を常時表示する */}
      <footer className="flex h-6 shrink-0 items-center gap-2.5 border-t border-border-strong bg-chrome px-2.5 text-[11px] text-muted-foreground">
        <span className="min-w-0 flex-1 truncate" title={statusMessage}>
          {statusMessage}
        </span>

        {worldVersionLabel !== '' && (
          <span className={`mono-data shrink-0 ${worldVersionToneClass}`} title={worldVersionTitle}>
            MC {worldVersionLabel}
          </span>
        )}
        {worldDataVersionLabel !== '' && (
          <span className="mono-data shrink-0" title="ワールドの DataVersion">
            DV {worldDataVersionLabel}
          </span>
        )}
        {assetsReady && (
          <span className="mono-data shrink-0" title="テクスチャ解決に使用しているバニラ assets">
            assets {vanillaVersionLabel}
          </span>
        )}
        {!assetsReady && (
          <span className="mono-data shrink-0 text-warning">assets 準備中</span>
        )}
        {assetsStatus !== null && assetsStatus.worldPackLoaded && (
          <span className="mono-data shrink-0" title="ワールド同梱のリソースパックを読み込み済み">
            world pack
          </span>
        )}

        <Separator orientation="vertical" className="h-3 shrink-0 bg-border-strong" />
        {/* パスは末尾のワールド名が要るので、あふれたときは先頭側を省略する */}
        <span className="mono-data selectable shrink-0" title={worldPathLabel}>
          {formatStatusBarPath(worldPathLabel)}
        </span>
      </footer>
    </div>
  )
}
