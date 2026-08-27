import * as React from 'react'
import { cn } from '@renderer/lib/utils'

function Card({ className, ...props }: React.ComponentProps<'div'>): JSX.Element {
  return <div className={cn('rounded-lg border border-border bg-card text-card-foreground', className)} {...props} />
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>): JSX.Element {
  return <div className={cn('flex flex-col gap-1 px-3 py-2.5', className)} {...props} />
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>): JSX.Element {
  return <div className={cn('text-[13px] font-semibold leading-none', className)} {...props} />
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>): JSX.Element {
  return <div className={cn('text-[12px] leading-relaxed text-muted-foreground', className)} {...props} />
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>): JSX.Element {
  return <div className={cn('px-3 pb-3', className)} {...props} />
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent }
