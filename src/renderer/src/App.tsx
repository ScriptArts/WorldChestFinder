import { useEffect, useMemo, useRef, useState } from 'react'
import { FolderOpen, Save, Search } from 'lucide-react'
import { coalesce, formatError } from '../../shared/valueUtils'
import { ChestGrid } from './components/ChestGrid'
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
  if (kind === 'success') {
    return 'border-b border-green-500/40 bg-green-500/15 px-4 py-3 text-sm font-medium text-green-950 dark:text-green-100'
  }
  if (kind === 'error') {
    return 'border-b border-destructive/40 bg-destructive/15 px-4 py-3 text-sm font-medium text-destructive'
  }
  return 'border-b border-primary/30 bg-primary/10 px-4 py-3 text-sm font-medium'
}

/** メインアプリケーション（ワールド選択・スキャン・編集・保存） */
export default function App(): JSX.Element {
  const [isScanning, setIsScanning] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isMovingSlot, setIsMovingSlot] = useState(false)
  const [saveNotice, setSaveNotice] = useState<{ kind: 'success' | 'error' | 'info'; message: string } | null>(null)

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
      if (!isScanning) {
        setStatusMessage(nextProgress.message)
      }
    })

    // 起動時にバニラ assets の準備状態を取得する
    window.worldChest.ensureAssets().then((status) => {
      setAssetsStatus(status)
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

  useEffect(() => {
    window.worldChest.getContainers(filter).then(setContainers)
  }, [filter, setContainers])

  const selectedContainer = useMemo(() => {
    const found = containers.find((entry) => entry.id === selectedContainerId)
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
    if (progress !== null) {
      return progress
    }
    if (isScanning && assetProgress !== null) {
      return assetProgress
    }
    return null
  }, [progress, isScanning, assetProgress])

  const isBusy = isScanning || isSaving || isMovingSlot

  async function refreshSaveStatus(): Promise<void> {
    const status = await window.worldChest.getSaveStatus()
    setSaveStatus(status)
  }

  function showSaveNotice(kind: 'success' | 'error' | 'info', message: string): void {
    setSaveNotice({ kind, message })
    setStatusMessage(message)
  }

  function clearWorldPreview(path: string): void {
    setWorldPath(path)
    setScanResult({ worldPath: path, containers: [], errors: [] })
    setContainers([])
  }

  function isSelectedContainer(containerId: string): boolean {
    if (selectedContainerIdRef.current === containerId) {
      // 非同期操作開始時と同じコンテナが選択されている場合だけ true を返す
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
    if (!saveNotice) {
      return
    }
    const timer = window.setTimeout(() => setSaveNotice(null), 8000)
    return () => window.clearTimeout(timer)
  }, [saveNotice])

  async function handleSelectWorld(): Promise<void> {
    if (saveStatus.pendingRegionCount > 0) {
      const message = '未保存の変更があります。保存してから別のワールドを選択してください'
      showSaveNotice('info', message)
      return
    }
    const path = await window.worldChest.selectWorld()
    if (path) {
      clearWorldPreview(path)
      setStatusMessage(`Selected: ${path}`)
    }
  }

  async function handleScan(): Promise<void> {
    if (!worldPath) {
      setStatusMessage('先にワールドを選択してください')
      return
    }
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
      const result = await window.worldChest.scanWorld(worldPath)
      setScanResult(result)
      const nextStatus = await window.worldChest.getAssetsStatus()
      setAssetsStatus(nextStatus)
      const nextContainers = await window.worldChest.getContainers(filter)
      setContainers(nextContainers)
      // スキャン完了後に保存状態を同期する
      await refreshSaveStatus()
      setStatusMessage(`スキャン完了: ${result.containers.length} コンテナ (${result.errors.length} エラー)`)
    } catch (error) {
      const message = `スキャンに失敗しました: ${formatError(error)}`
      showSaveNotice('error', message)
    } finally {
      await waitForProgressVisibility(startedAt)
      setIsScanning(false)
      setProgress(null)
    }
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
      const report = await window.worldChest.saveChanges()
      // 保存成功後に未保存件数を同期する
      await refreshSaveStatus()

      if (report.nothingToSave) {
        const message = '保存する変更がありません。スロットを編集してから保存してください'
        showSaveNotice('info', message)
      } else if (report.success) {
        const message = `保存完了: ${report.savedFiles.length} リージョンファイルを書き込みました`
        showSaveNotice('success', message)
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

  const assetsReady = assetsStatus !== null && assetsStatus.ready
  const canScan = worldPath !== null && assetsReady && !isBusy && saveStatus.pendingRegionCount === 0
  const canSave = !isBusy && saveStatus.worldLoaded && saveStatus.pendingRegionCount > 0

  let saveButtonVariant: 'default' | 'outline' = 'outline'
  if (isSaving) {
    saveButtonVariant = 'default'
  }

  let saveButtonLabel = '保存'
  if (isSaving) {
    saveButtonLabel = '保存中...'
  }

  let worldPathLabel = '未選択'
  if (worldPath !== null) {
    worldPathLabel = worldPath
  }

  let vanillaVersionLabel = 'cached'
  if (assetsStatus !== null && assetsStatus.vanillaVersion !== null) {
    vanillaVersionLabel = assetsStatus.vanillaVersion
  }

  async function moveSelectedSlot(fromSlot: number, toSlot: number): Promise<void> {
    if (!selectedContainer || isBusy || isMovingSlot) {
      // 操作中は DnD の重複 IPC を送らない
      return
    }

    const targetContainerId = selectedContainer.id
    setIsMovingSlot(true)
    try {
      const updated = await window.worldChest.moveSlot({
        containerId: targetContainerId,
        fromSlot,
        toSlot
      })
      if (updated) {
        if (isSelectedContainer(targetContainerId)) {
          // DnD 中に別コンテナへ切り替わっていない場合だけ画面へ反映する
          updateContainer(updated)
          await refreshSaveStatus()
          selectSlot(toSlot)
          setStatusMessage(`Slot ${fromSlot} → ${toSlot} に移動（未保存）`)
        }
      } else {
        setStatusMessage('スロットの移動に失敗しました。再スキャンしてからお試しください')
      }
    } finally {
      setIsMovingSlot(false)
    }
  }

  async function handleSlotUpdated(container: NonNullable<typeof selectedContainer>, targetSlot: number | undefined): Promise<void> {
    if (isBusy) {
      // 操作中に到着した古い更新結果は UI へ反映しない
      return
    }
    updateContainer(container)
    await refreshSaveStatus()
    if (targetSlot !== undefined) {
      selectSlot(targetSlot)
    }

    let message = `Slot ${selectedSlot} を更新しました（未保存）`
    if (targetSlot !== undefined && targetSlot !== selectedSlot) {
      message = `Slot ${selectedSlot} → ${targetSlot} に移動（未保存）`
    }
    setStatusMessage(message)
  }

  return (
    <div className="grid h-screen min-h-0 grid-rows-[auto_auto_1fr_auto] overflow-hidden bg-background">
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

      <main className="relative grid min-h-0 gap-3 overflow-hidden p-3 lg:grid-cols-[420px_1fr]">
        {isBusy && (
          <div
            className="absolute inset-0 z-10 cursor-wait bg-background/50"
            aria-hidden
          />
        )}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card p-3">
          <SearchBar filter={filter} onChange={setFilter} disabled={isBusy} />
          <Separator className="my-3" />
          <ContainerList
            containers={containers}
            selectedId={selectedContainerId}
            onSelect={selectContainer}
            disabled={isBusy}
          />
        </section>

        <section className="flex w-full min-h-0 flex-col gap-6 overflow-y-auto p-6">
          <div className="flex justify-center">
            <ChestGrid
              container={selectedContainer}
              selectedSlot={selectedSlot}
              onSelectSlot={selectSlot}
              disabled={isBusy}
              onMoveSlot={moveSelectedSlot}
            />
          </div>
          <SlotEditor
            container={selectedContainer}
            slot={selectedSlot}
            disabled={isBusy}
            onUpdated={handleSlotUpdated}
            onError={setStatusMessage}
          />
        </section>
      </main>

      <footer className="border-t bg-card px-4 py-2 text-sm text-muted-foreground">{statusMessage}</footer>
    </div>
  )
}
