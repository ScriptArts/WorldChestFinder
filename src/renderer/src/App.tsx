import { useEffect, useMemo, useRef, useState } from 'react'
import { FolderOpen, Save, Search } from 'lucide-react'
import type { SearchFilter } from '../../shared/types'
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

/**
 * 保存結果バナーの Tailwind クラスを種別に応じて返す。
 *
 * @param kind - success / error / info
 */
function getSaveNoticeClassName(kind: 'success' | 'error' | 'info'): string {
  // 成功通知用のスタイルを返す
  if (kind === 'success') {
    return 'border-b border-green-500/40 bg-green-500/15 px-4 py-3 text-sm font-medium text-green-950 dark:text-green-100'
  }
  // エラー通知用のスタイルを返す
  if (kind === 'error') {
    return 'border-b border-destructive/40 bg-destructive/15 px-4 py-3 text-sm font-medium text-destructive'
  }
  return 'border-b border-primary/30 bg-primary/10 px-4 py-3 text-sm font-medium'
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
      worldMetadata: buildWorldMetadata(0, null, path.split(/[/\\]/).pop() || path),
      containers: [],
      errors: []
    })
    setContainers([])
  }

  function resetLoadedWorldPreview(): void {
    setWorldPath(null)
    setScanResult(null)
    setContainers([])
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

  async function handleSearch(nextFilter: SearchFilter): Promise<void> {
    setFilter(nextFilter)
    // フィルタ条件に一致するコンテナ一覧を取得する
    const nextContainers = await window.worldChest.getContainers(nextFilter)
    setContainers(nextContainers)
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
      const nextContainers = await window.worldChest.getContainers(filter)
      setContainers(nextContainers)
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

  const assetsReady = assetsStatus !== null && assetsStatus.ready
  const canScan = worldPath !== null && assetsReady && !isBusy && saveStatus.pendingRegionCount === 0
  let canSave = !isBusy && saveStatus.worldLoaded && saveStatus.pendingRegionCount > 0 && worldWritable

  let saveButtonVariant: 'default' | 'outline' = 'outline'
  // 保存中はボタンを強調表示する
  if (isSaving) {
    saveButtonVariant = 'default'
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

  let vanillaVersionLabel = 'cached'
  // バニラバージョンが取得できていれば表示名を差し替える
  if (assetsStatus !== null && assetsStatus.vanillaVersion !== null) {
    vanillaVersionLabel = assetsStatus.vanillaVersion
  }

  let worldVersionLabel = ''
  if (worldFormat !== null) {
    worldVersionLabel = `${worldFormat.versionLabel} (DV ${worldFormat.dataVersion})`
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
    <div className="grid h-screen min-h-0 grid-rows-[auto_auto_1fr] overflow-hidden bg-background">
      <header className="flex flex-wrap items-center gap-2 border-b bg-card px-4 py-3">
        <Button type="button" variant="secondary" onClick={handleSelectWorld} disabled={isBusy}>
          <FolderOpen />
          ワールド選択
        </Button>
        <Button type="button" onClick={handleScan} disabled={!canScan}>
          <Search />
          スキャン
        </Button>
        <Button
          type="button"
          variant={saveButtonVariant}
          onClick={handleSave}
          disabled={!canSave}
        >
          <Save />
          {saveButtonLabel}
        </Button>

        <div className="ml-auto flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span
            className="max-w-[420px] truncate"
            title={worldPathLabel}
          >
            {worldPathLabel}
          </span>
          {worldVersionLabel !== '' && (
            <Badge variant={worldWritable ? 'secondary' : 'destructive'} title={`DataVersion ${scanResult?.worldMetadata.dataVersion}`}>
              World: {worldVersionLabel}
            </Badge>
          )}
          {assetsReady && (
            <Badge variant="secondary">Vanilla: {vanillaVersionLabel}</Badge>
          )}
          {!assetsReady && (
            <Badge variant="outline">Assets: 準備中</Badge>
          )}
          {assetsStatus !== null && assetsStatus.worldPackLoaded && (
            <Badge variant="outline">World pack</Badge>
          )}
          {saveStatus.pendingRegionCount > 0 && (
            <Badge variant="destructive">未保存 {saveStatus.pendingRegionCount} リージョン</Badge>
          )}
        </div>
      </header>

      {saveNotice && (
        <div className={getSaveNoticeClassName(saveNotice.kind)} role="status">
          {saveNotice.message}
        </div>
      )}

      {isScanning && loadProgress !== null && (
        <OperationProgressBar title="ワールド読み込み中" progress={loadProgress} />
      )}
      {isSaving && saveProgress !== null && (
        <OperationProgressBar title="ワールド保存中" progress={saveProgress} />
      )}

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

      <main className="relative grid min-h-0 gap-3 overflow-hidden p-3 lg:grid-cols-[420px_1fr]">
        {isBusy && (
          <div
            className="absolute inset-0 z-10 cursor-wait bg-background/50"
            aria-hidden
          />
        )}
        <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-card p-3">
          <SearchBar appliedFilter={filter} onSearch={handleSearch} disabled={isBusy} />
          <Separator className="my-3" />
          <ContainerList
            containers={containers}
            selectedId={selectedContainerId}
            onSelect={selectContainer}
            disabled={isBusy}
          />
        </section>

        <section className="flex h-full min-h-0 w-full flex-col gap-3 overflow-hidden">
          <div className="flex shrink-0 justify-center">
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
    </div>
  )
}
