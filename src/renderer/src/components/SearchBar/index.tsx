import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import type { SearchFilter, SourceType } from '../../../../shared/types'
import { coalesce } from '../../../../shared/valueUtils'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../ui/select'

interface SearchBarProps {
  /** 適用済みの検索条件（検索ボタン押下後） */
  appliedFilter: SearchFilter
  /** 選択できるディメンション ID（スキャン結果に実在するもの） */
  dimensions: string[]
  /** 検索ボタン押下時に呼ばれる */
  onSearch: (filter: SearchFilter) => void
  disabled?: boolean
}

function dimensionSelectValue(dimension: string | undefined): string {
  // 未指定なら「全ディメンション」を選択状態にする
  if (dimension === undefined) {
    return 'all'
  }
  return dimension
}

function sourceTypeSelectValue(sourceType: SourceType | undefined): string {
  // 未指定なら「全タイプ」を選択状態にする
  if (sourceType === undefined) {
    return 'all'
  }
  return sourceType
}

function minCountInputValue(minCount: number | undefined): string {
  // 未指定なら入力欄を空にする
  if (minCount === undefined) {
    return ''
  }
  return String(minCount)
}

function posInputValue(value: number | undefined): string {
  // 未指定なら入力欄を空にする
  if (value === undefined) {
    return ''
  }
  return String(value)
}

function parseOptionalCoordinate(raw: string): number | undefined {
  // 空文字は座標未指定として扱う
  if (raw === '') {
    return undefined
  }
  const parsed = Number(raw)
  // 数値に変換できなければ未指定とする
  if (!Number.isFinite(parsed)) {
    return undefined
  }
  return Math.trunc(parsed)
}

/**
 * コンテナ検索フィルタ入力 UI。
 * 入力中は絞り込まず、検索ボタン押下で onSearch を呼ぶ。
 *
 * @param appliedFilter - 適用済み検索条件
 * @param onSearch - 検索実行コールバック
 * @param disabled - 操作中は true で入力不可
 */
export function SearchBar({ appliedFilter, dimensions, onSearch, disabled = false }: SearchBarProps): JSX.Element {
  const [draftFilter, setDraftFilter] = useState<SearchFilter>(appliedFilter)

  useEffect(() => {
    // 外部で適用済み条件が変わったら下書きを同期する
    setDraftFilter(appliedFilter)
  }, [appliedFilter])

  function handleSubmit(event: React.FormEvent): void {
    event.preventDefault()
    // 操作中は検索を実行しない
    if (disabled) {
      return
    }
    onSearch(draftFilter)
  }

  return (
    <form className="grid gap-2.5" onSubmit={handleSubmit}>
      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-1.5">
          <Label>ディメンション</Label>
          <Select
            value={dimensionSelectValue(draftFilter.dimension)}
            disabled={disabled}
            onValueChange={(value) => {
              let nextDimension: string | undefined = value
              // 「全ディメンション」選択時はフィルタ条件を解除する
              if (value === 'all') {
                nextDimension = undefined
              }
              setDraftFilter({ ...draftFilter, dimension: nextDimension })
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="全ディメンション" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全ディメンション</SelectItem>
              {/* スキャン結果に実在する次元 ID を候補にする */}
              {dimensions.map((dimension) => (
                <SelectItem key={dimension} value={dimension}>
                  {dimension}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label>コンテナタイプ</Label>
          <Select
            value={sourceTypeSelectValue(draftFilter.sourceType)}
            disabled={disabled}
            onValueChange={(value) => {
              let nextSourceType: SourceType | undefined = value as SourceType
              // 「全タイプ」選択時はフィルタ条件を解除する
              if (value === 'all') {
                nextSourceType = undefined
              }
              setDraftFilter({ ...draftFilter, sourceType: nextSourceType })
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="全タイプ" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全タイプ</SelectItem>
              <SelectItem value="block_entity">block_entity</SelectItem>
              <SelectItem value="entity">entity</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label>座標</Label>
        {/* 軸名を入力欄の左に置いて 1 行に収める */}
        <div className="grid grid-cols-3 gap-1.5">
          <div className="flex items-center gap-1">
            <Label htmlFor="search-pos-x" className="mono-data w-2.5 shrink-0 text-center">
              X
            </Label>
            <Input
              id="search-pos-x"
              type="number"
              className="mono-data px-1.5"
              placeholder="—"
              value={posInputValue(draftFilter.posX)}
              disabled={disabled}
              onChange={(event) => {
                setDraftFilter({ ...draftFilter, posX: parseOptionalCoordinate(event.target.value) })
              }}
            />
          </div>
          <div className="flex items-center gap-1">
            <Label htmlFor="search-pos-y" className="mono-data w-2.5 shrink-0 text-center">
              Y
            </Label>
            <Input
              id="search-pos-y"
              type="number"
              className="mono-data px-1.5"
              placeholder="—"
              value={posInputValue(draftFilter.posY)}
              disabled={disabled}
              onChange={(event) => {
                setDraftFilter({ ...draftFilter, posY: parseOptionalCoordinate(event.target.value) })
              }}
            />
          </div>
          <div className="flex items-center gap-1">
            <Label htmlFor="search-pos-z" className="mono-data w-2.5 shrink-0 text-center">
              Z
            </Label>
            <Input
              id="search-pos-z"
              type="number"
              className="mono-data px-1.5"
              placeholder="—"
              value={posInputValue(draftFilter.posZ)}
              disabled={disabled}
              onChange={(event) => {
                setDraftFilter({ ...draftFilter, posZ: parseOptionalCoordinate(event.target.value) })
              }}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[auto_1fr] items-center gap-2">
        <Label htmlFor="search-min-count">最小アイテム数</Label>
        <Input
          id="search-min-count"
          type="number"
          min={1}
          className="mono-data"
          placeholder="指定なし"
          value={minCountInputValue(draftFilter.minCount)}
          disabled={disabled}
          onChange={(event) => {
            let nextMinCount: number | undefined
            // 入力値があれば数値化し、空なら条件を解除する
            if (event.target.value) {
              nextMinCount = Number(event.target.value)
            // 空入力なら最小個数条件を解除する
            } else {
              nextMinCount = undefined
            }
            setDraftFilter({
              ...draftFilter,
              minCount: nextMinCount
            })
          }}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="search-nbt">NBT（部分一致）</Label>
        <Input
          id="search-nbt"
          type="search"
          className="mono-data"
          placeholder="minecraft:diamond"
          value={coalesce(draftFilter.nbt, '')}
          disabled={disabled}
          onChange={(event) => setDraftFilter({ ...draftFilter, nbt: event.target.value })}
        />
      </div>

      <Button type="submit" className="mt-0.5 w-full" disabled={disabled}>
        <Search />
        検索
      </Button>
    </form>
  )
}
