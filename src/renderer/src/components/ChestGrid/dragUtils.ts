/** スロット DnD 用の MIME タイプ */
export const DRAG_MIME = 'application/x-worldchest-slot'

/** ネイティブドラッグ画像を非表示にする 1x1 透明 GIF */
const TRANSPARENT_DRAG_IMAGE =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

let transparentDragImage: HTMLImageElement | null = null

/**
 * ブラウザ標準のドラッグゴースト画像を非表示にする。
 *
 * @param event - dragstart イベント
 */
export function hideNativeDragImage(event: React.DragEvent): void {
  if (!transparentDragImage) {
    transparentDragImage = new Image()
    transparentDragImage.src = TRANSPARENT_DRAG_IMAGE
  }
  event.dataTransfer.setDragImage(transparentDragImage, 0, 0)
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
