import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * clsx と tailwind-merge を組み合わせた className 結合ヘルパー。
 *
 * @param inputs - クラス名断片
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
