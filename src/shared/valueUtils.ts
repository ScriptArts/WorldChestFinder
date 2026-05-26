/**
 * 最初に undefined / null でない値を返す。
 *
 * @param values - 候補値の列
 * @returns 最初に見つかった値。すべて未定義なら undefined
 */
export function firstDefined<T>(...values: Array<T | undefined | null>): T | undefined {
  // 候補値を先頭から順に走査する
  for (const value of values) {
    // null / undefined でなければ採用する
    if (value !== undefined && value !== null) {
      return value
    }
  }
  return undefined
}

/**
 * 値が null / undefined のときフォールバックを返す。
 *
 * @param value - 判定対象の値
 * @param fallback - 代替値
 * @returns 有効な値、またはフォールバック
 */
export function coalesce<T>(value: T | undefined | null, fallback: T): T {
  // 値が未設定ならフォールバックを返す
  if (value === undefined || value === null) {
    return fallback
  }
  return value
}

/**
 * 例外オブジェクトをユーザー向けメッセージに変換する。
 *
 * @param error - catch 節で受け取った値
 * @returns 表示用エラーメッセージ
 */
export function formatError(error: unknown): string {
  // Error インスタンスなら message をそのまま使う
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

/**
 * 任意コールバックが渡されていれば実行する。
 *
 * @param callback - 省略可能なコールバック
 * @param args - コールバックへ渡す引数
 */
export function invokeOptional<T extends (...args: never[]) => void>(
  callback: T | undefined,
  ...args: Parameters<T>
): void {
  // コールバックが渡されていれば実行する
  if (callback !== undefined) {
    callback(...args)
  }
}
