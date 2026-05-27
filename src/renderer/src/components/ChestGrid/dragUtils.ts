/** スロット DnD 用の MIME タイプ */
export const DRAG_MIME = 'application/x-worldchest-slot'

/** setDragImage 用の非表示ホスト（DOM 添付が必要） */
let nativeDragImageHost: HTMLDivElement | null = null

/**
 * Electron / Chromium 向けに非表示ドラッグ画像ホストを body へ追加する。
 *
 * @remarks setDragImage は DOM 外の canvas だと初回ドラッグ時に地球アイコンが出ることがある
 */
export function prepareNativeDragImageHost(): void {
  // SSR 等 document 未生成環境では何もしない
  if (typeof document === 'undefined') {
    return
  }
  // 既に追加済みなら再利用する
  if (nativeDragImageHost !== null) {
    return
  }
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.position = 'fixed'
  host.style.left = '-9999px'
  host.style.top = '0'
  host.style.width = '1px'
  host.style.height = '1px'
  host.style.opacity = '0'
  host.style.pointerEvents = 'none'
  document.body.appendChild(host)
  nativeDragImageHost = host
}

/**
 * ブラウザ標準のドラッグゴースト画像を非表示にする。
 *
 * @param event - dragstart イベント
 */
export function hideNativeDragImage(event: React.DragEvent): void {
  prepareNativeDragImageHost()
  // body へ追加した透明ホストをネイティブドラッグ画像として使う
  if (nativeDragImageHost !== null) {
    event.dataTransfer.setDragImage(nativeDragImageHost, 0, 0)
  }
}

/** カスタムドラッグプレビューの表示状態 */
export interface DragPreviewState {
  x: number
  y: number
  textureUrl: string | null
  label: string
  count: number
}

/** ドラッグプレビューをカーソルからずらすオフセット（px） */
export const DRAG_PREVIEW_OFFSET = 16
