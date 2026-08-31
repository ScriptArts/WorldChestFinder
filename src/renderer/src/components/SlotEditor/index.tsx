import { useEffect, useRef, useState } from 'react'
import type { ContainerRecord, ItemSnbtParseResult, ItemStackView } from '../../../../shared/types'
import type { WorldFormat } from '../../../../shared/world/WorldFormat'
import { Button } from '../ui/button'
import { JsonCodeEditor } from '../ui/json-code-editor'
import { Label } from '../ui/label'

interface SlotEditorProps {
  container: ContainerRecord | null
  slot: number | null
  worldFormat: WorldFormat | null
  onUpdated: (container: ContainerRecord, targetSlot?: number) => void
  onError: (message: string) => void
  disabled?: boolean
}

interface EditorTarget {
  containerId: string
  slot: number
}

function itemFromSnbt(slot: number, itemId: string, count: number, rawSnbt: string): ItemStackView {
  return {
    slot,
    itemId,
    count,
    displaySummary: '',
    raw: rawSnbt
  }
}

function targetsMatch(current: EditorTarget | null, expected: EditorTarget): boolean {
  // 適用開始時と同じ対象が表示中なら true を返す
  if (current !== null && current.containerId === expected.containerId && current.slot === expected.slot) {
    return true
  }
  return false
}

function parseTargetSlot(parsed: ItemSnbtParseResult, fallback: number, slotCount: number): number | null {
  let candidate = fallback
  // SNBT に Slot が数値で指定されていればそれを優先する
  if (parsed.slot !== null) {
    candidate = parsed.slot
  }
  // スロット番号が範囲外なら無効
  if (!Number.isInteger(candidate) || candidate < 0 || candidate >= slotCount) {
    return null
  }
  return candidate
}

/**
 * 選択スロットの NBT SNBT を編集するパネル。
 *
 * @param container - 編集対象コンテナ
 * @param slot - 編集対象スロット番号
 * @param onUpdated - 適用成功時コールバック
 * @param onError - エラーメッセージ通知
 * @param disabled - 操作中は true
 */
export function SlotEditor({ container, slot, worldFormat, onUpdated, onError, disabled = false }: SlotEditorProps): JSX.Element {
  const [nbtSnbt, setNbtSnbt] = useState('{}')
  const [isApplying, setIsApplying] = useState(false)
  const applyingRef = useRef(false)
  const activeTargetRef = useRef<EditorTarget | null>(null)

  useEffect(() => {
    // コンテナまたはスロット未選択なら編集対象をクリアする
    if (!container || slot === null) {
      activeTargetRef.current = null
      return
    }
    activeTargetRef.current = { containerId: container.id, slot }
    const existing = container.items.find((entry) => entry.slot === slot)

    // 既存アイテムがあればその SNBT をそのままエディタへ読み込む
    if (existing !== undefined) {
      setNbtSnbt(existing.raw)
      return
    }

    // 空スロットのテンプレートは main プロセス（SpringNBTLibrary）に生成させる
    let cancelled = false
    setNbtSnbt('{}')
    window.worldChest
      .buildEmptySlotSnbt(slot)
      .then((template) => {
        // 取得中に別スロットへ切り替わっていた場合は反映しない
        if (cancelled) {
          return
        }
        setNbtSnbt(template)
      })
      .catch(() => {
        // テンプレートを取得できない場合は空の compound を表示したままにする
      })

    return () => {
      cancelled = true
    }
  }, [container, slot])

  // コンテナまたはスロット未選択、またはワールド形式不明時は案内を表示する
  if (!container || slot === null || worldFormat === null) {
    return (
      <div className="flex h-full min-h-0 w-full items-center justify-center rounded-lg border border-dashed border-border-strong bg-card/50 p-6 text-center text-[12px] text-muted-foreground">
        チェストのスロットを選ぶと、ここで NBT を編集できます
      </div>
    )
  }

  async function applyItem(nextItem: ItemStackView | null): Promise<void> {
    // 操作中または適用中は重複 IPC を送らない
    if (disabled || applyingRef.current) {
      return
    }
    const targetContainerId = container.id
    const targetSlotBeforeApply = slot
    const expectedTarget = { containerId: targetContainerId, slot: targetSlotBeforeApply }
    applyingRef.current = true
    setIsApplying(true)
    try {
      // メインプロセスへスロット更新を依頼する
      const updated = await window.worldChest.updateSlot({
        containerId: targetContainerId,
        slot: targetSlotBeforeApply,
        item: nextItem
      })
      // 更新成功時のみ UI を反映する
      if (updated) {
        // 適用中に別コンテナへ切り替わっていない場合だけ画面へ反映する
        if (targetsMatch(activeTargetRef.current, expectedTarget)) {
          let targetSlot: number | undefined
          // クリア以外なら移動先スロットを親へ通知する
          if (nextItem !== null) {
            targetSlot = nextItem.slot
          }
          onUpdated(updated, targetSlot)
        }
        return
      }
      onError('スロットの更新に失敗しました。スキャン後に再度お試しください。')
    } finally {
      applyingRef.current = false
      setIsApplying(false)
    }
  }

  async function apply(): Promise<void> {
    const snbtText = nbtSnbt.trim()
    // SNBT の解析は main プロセス（SpringNBTLibrary）へ委ねる
    const parsed = await window.worldChest.parseItemSnbt(snbtText)
    // 解析に失敗した場合はライブラリのメッセージを添えて通知する
    if (!parsed.ok) {
      // 失敗理由が取得できた場合はメッセージへ含める
      if (parsed.message !== null) {
        onError(`NBT SNBT の形式が正しくありません: ${parsed.message}`)
        return
      }
      onError('NBT SNBT の形式が正しくありません')
      return
    }

    const targetSlot = parseTargetSlot(parsed, slot, container.slotCount)
    // スロット番号が不正ならエラーを表示する
    if (targetSlot === null) {
      onError(`Slot は 0 〜 ${container.slotCount - 1} の整数で指定してください`)
      return
    }
    // id が不正ならエラーを表示する
    if (parsed.itemId === null) {
      onError('id は空でない文字列で指定してください')
      return
    }
    // 個数が不正ならエラーを表示する
    if (!Number.isInteger(parsed.count) || parsed.count < 0 || parsed.count > 64) {
      onError('count または Count は 0 〜 64 の整数で指定してください')
      return
    }
    await applyItem(itemFromSnbt(targetSlot, parsed.itemId, parsed.count, snbtText))
  }

  const editorDisabled = disabled || isApplying

  const existingItem = container.items.find((entry) => entry.slot === slot)

  let slotItemLabel = '空きスロット'
  // アイテムが入っているスロットは ID と個数を見出しへ出す
  if (existingItem !== undefined) {
    slotItemLabel = `${existingItem.itemId} × ${existingItem.count}`
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-lg border border-border bg-card">
      {/* 見出し: 編集対象のスロット番号と現在の中身 */}
      <div className="flex shrink-0 items-baseline gap-2 border-b border-border bg-muted px-3 py-2">
        <span className="micro text-muted-foreground">スロット</span>
        <span className="mono-data text-[13px] font-semibold leading-none">{slot}</span>
        <span className="mono-data ml-auto min-w-0 truncate text-[11px] text-muted-foreground" title={slotItemLabel}>
          {slotItemLabel}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-2.5">
        <Label htmlFor="slot-nbt-snbt" className="sr-only">
          NBT (SNBT)
        </Label>
        <JsonCodeEditor
          id="slot-nbt-snbt"
          value={nbtSnbt}
          disabled={editorDisabled}
          fillHeight
          onChange={(value) => {
            // SNBT エディタの内容をそのまま編集状態へ反映する
            setNbtSnbt(value)
          }}
        />
      </div>

      {/* 操作列: 適用してもまだディスクへは書かれないことを添える */}
      <div className="flex shrink-0 items-center gap-2 border-t border-border bg-muted px-2.5 py-2">
        <p className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
          「適用」はメモリ上の変更です。ワールドへ書き込むにはツールバーの「保存」を押します
        </p>
        <Button type="button" variant="outline" onClick={() => applyItem(null)} disabled={editorDisabled}>
          クリア
        </Button>
        <Button type="button" onClick={apply} disabled={editorDisabled}>
          適用
        </Button>
      </div>
    </div>
  )
}
