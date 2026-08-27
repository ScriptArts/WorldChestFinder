import * as React from 'react'
import * as LabelPrimitive from '@radix-ui/react-label'
import { cn } from '@renderer/lib/utils'

/** 入力欄の見出し。計器のラベルのように極小の大文字で表示する。 */
function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>): JSX.Element {
  return (
    <LabelPrimitive.Root
      className={cn('micro text-muted-foreground peer-disabled:opacity-50', className)}
      {...props}
    />
  )
}

export { Label }
