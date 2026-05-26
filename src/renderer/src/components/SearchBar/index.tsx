import type { SearchFilter, SourceType } from '../../../../shared/types'
import { coalesce } from '../../../../shared/valueUtils'
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
  filter: SearchFilter
  onChange: (filter: SearchFilter) => void
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

/**
 * コンテナ検索フィルタ入力 UI。
 *
 * @param filter - 現在の検索条件
 * @param onChange - 条件変更コールバック
 * @param disabled - 操作中は true で入力不可
 */
export function SearchBar({ filter, onChange, disabled = false }: SearchBarProps): JSX.Element {
  return (
    <div className="grid gap-3">
      <div className="grid gap-2">
        <Label htmlFor="search-item-id">アイテム ID</Label>
        <Input
          id="search-item-id"
          type="search"
          placeholder="例: diamond"
          value={coalesce(filter.query, '')}
          disabled={disabled}
          onChange={(event) => onChange({ ...filter, query: event.target.value })}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="search-nbt">NBT</Label>
        <Input
          id="search-nbt"
          type="search"
          value={coalesce(filter.nbt, '')}
          disabled={disabled}
          onChange={(event) => onChange({ ...filter, nbt: event.target.value })}
        />
      </div>

      <div className="grid gap-2">
        <Label>ディメンション</Label>
        <Select
          value={dimensionSelectValue(filter.dimension)}
          disabled={disabled}
          onValueChange={(value) => {
            let nextDimension: string | undefined = value
            if (value === 'all') {
              nextDimension = undefined
            }
            onChange({ ...filter, dimension: nextDimension })
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
        <Label>ソースタイプ</Label>
        <Select
          value={sourceTypeSelectValue(filter.sourceType)}
          disabled={disabled}
          onValueChange={(value) => {
            let nextSourceType: SourceType | undefined = value as SourceType
            if (value === 'all') {
              nextSourceType = undefined
            }
            onChange({ ...filter, sourceType: nextSourceType })
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

      <div className="grid gap-2">
        <Label htmlFor="search-min-count">最小数量</Label>
        <Input
          id="search-min-count"
          type="number"
          min={1}
          placeholder="任意"
          value={minCountInputValue(filter.minCount)}
          disabled={disabled}
          onChange={(event) => {
            let nextMinCount: number | undefined
            if (event.target.value) {
              nextMinCount = Number(event.target.value)
            } else {
              nextMinCount = undefined
            }
            onChange({
              ...filter,
              minCount: nextMinCount
            })
          }}
        />
      </div>
    </div>
  )
}
