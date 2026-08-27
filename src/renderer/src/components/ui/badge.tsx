import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@renderer/lib/utils'

/*
 * データの属性を示すタグ。
 * 大文字 + 等幅にして「値の表示」であることを見た目で示す。
 */
const badgeVariants = cva(
  'inline-flex h-[18px] items-center gap-1 rounded-sm border px-1.5 font-mono text-[10px] font-semibold uppercase leading-none tracking-[0.06em] tabular-nums',
  {
    variants: {
      variant: {
        default: 'border-primary bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-muted text-muted-foreground',
        outline: 'border-border-strong bg-transparent text-muted-foreground',
        destructive: 'border-destructive/45 bg-destructive/10 text-destructive',
        selection: 'border-selection/40 bg-selection/10 text-selection-foreground'
      }
    },
    defaultVariants: {
      variant: 'default'
    }
  }
)

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof badgeVariants>): JSX.Element {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
