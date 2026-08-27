import * as React from 'react'
import { cn } from '@renderer/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>): JSX.Element {
  return (
    <input
      type={type}
      className={cn(
        'flex h-7 w-full rounded-md border border-input bg-card px-2 text-[13px] leading-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-40 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
        className
      )}
      {...props}
    />
  )
}

export { Input }
