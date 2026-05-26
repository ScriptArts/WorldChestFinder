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
  /** 検索ボタン押下時に呼ばれる */
  onSearch: (filter: SearchFilter) => void
  disabled?: boolean
}

function dimensionSelectValue(dimension: string | undefined): string {
  if (dimension === undefined) {
    return 'all'
  }
  return dimension
}

function sourceTypeSelectValue(sourceType: SourceType | undefined): string {
  if (sourceType === undefined) {
    return 'all'
  }
  return sourceType
}

function minCountInputValue(minCount: number | undefined): string {
  if (minCount === undefined) {
    return ''
  }
  return String(minCount)
}

function posInputValue(value: number | undefined): string {
  if (value === undefined) {
    return ''
  }
  return String(value)
}

function parseOptionalCoordinate(raw: string): number | undefined {
  if (raw === '') {
    return undefined
  }
  const parsed = Number(raw)
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
export function SearchBar({ appliedFilter, onSearch, disabled = false }: SearchBarProps): JSX.Element {
  const [draftFilter, setDraftFilter] = useState<SearchFilter>(appliedFilter)

  useEffect(() => {
    // 外部で適用済み条件が変わったら下書きを同期する
    setDraftFilter(appliedFilter)
  }, [appliedFilter])

  function handleSubmit(event: React.FormEvent): void {
    event.preventDefault()
    if (disabled) {
      return
    }
    onSearch(draftFilter)
  }

  return (
    <form className="grid gap-3" onSubmit={handleSubmit}>
      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-2">
          <Label>ディメンション</Label>
          <Select
            value={dimensionSelectValue(draftFilter.dimension)}
            disabled={disabled}
            onValueChange={(value) => {
              let nextDimension: string | undefined = value
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
              <SelectItem value="overworld">overworld</SelectItem>
              <SelectItem value="nether">nether</SelectItem>
              <SelectItem value="end">end</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <Label>コンテナタイプ</Label>
          <Select
            value={sourceTypeSelectValue(draftFilter.sourceType)}
            disabled={disabled}
            onValueChange={(value) => {
              let nextSourceType: SourceType | undefined = value as SourceType
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

      <div className="grid gap-2">
        <Label>Pos</Label>
        <div className="grid grid-cols-3 gap-2">
          <div className="grid gap-1">
            <Label htmlFor="search-pos-x" className="text-xs text-muted-foreground">
              X
            </Label>
            <Input
              id="search-pos-x"
              type="number"
              placeholder="任意"
              value={posInputValue(draftFilter.posX)}
              disabled={disabled}
              onChange={(event) => {
                setDraftFilter({ ...draftFilter, posX: parseOptionalCoordinate(event.target.value) })
              }}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="search-pos-y" className="text-xs text-muted-foreground">
              Y
            </Label>
            <Input
              id="search-pos-y"
              type="number"
              placeholder="任意"
              value={posInputValue(draftFilter.posY)}
              disabled={disabled}
              onChange={(event) => {
                setDraftFilter({ ...draftFilter, posY: parseOptionalCoordinate(event.target.value) })
              }}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="search-pos-z" className="text-xs text-muted-foreground">
              Z
            </Label>
            <Input
              id="search-pos-z"
              type="number"
              placeholder="任意"
              value={posInputValue(draftFilter.posZ)}
              disabled={disabled}
              onChange={(event) => {
                setDraftFilter({ ...draftFilter, posZ: parseOptionalCoordinate(event.target.value) })
              }}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="search-min-count">最小アイテム数</Label>
        <Input
          id="search-min-count"
          type="number"
          min={1}
          placeholder="任意"
          value={minCountInputValue(draftFilter.minCount)}
          disabled={disabled}
          onChange={(event) => {
            let nextMinCount: number | undefined
            if (event.target.value) {
              nextMinCount = Number(event.target.value)
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

      <div className="grid gap-2">
        <Label htmlFor="search-nbt">NBT</Label>
        <Input
          id="search-nbt"
          type="search"
          value={coalesce(draftFilter.nbt, '')}
          disabled={disabled}
          onChange={(event) => setDraftFilter({ ...draftFilter, nbt: event.target.value })}
        />
      </div>

      <Button type="submit" className="w-full" disabled={disabled}>
        <Search />
        検索
      </Button>
    </form>
  )
}
