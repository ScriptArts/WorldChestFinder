import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@renderer/lib/utils'

/*
 * 道具らしい密度のボタン。
 * 影は使わず、面 + 1px の枠線と地色の差だけで階層を表す。
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border text-[13px] font-medium leading-none transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-[15px] [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'border-primary bg-primary text-primary-foreground hover:bg-primary/85 active:bg-primary/75',
        destructive: 'border-destructive bg-destructive text-white hover:bg-destructive/85 active:bg-destructive/75',
        outline: 'border-border-strong bg-transparent text-foreground hover:border-primary/45 hover:bg-accent active:bg-accent',
        secondary: 'border-border-strong bg-card text-secondary-foreground hover:border-primary/45 hover:bg-accent active:bg-accent',
        ghost: 'border-transparent bg-transparent hover:bg-accent',
        link: 'border-transparent bg-transparent text-primary underline-offset-4 hover:underline'
      },
      size: {
        default: 'h-7 px-2.5',
        sm: 'h-6 px-2 text-[12px]',
        lg: 'h-8 px-4',
        icon: 'size-7'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
}): JSX.Element {
  let Comp: React.ElementType
  // 子要素をボタンとして扱う場合は Radix Slot を使う
  if (asChild) {
    Comp = Slot
  } else {
    Comp = 'button'
  }
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />
}

export { Button, buttonVariants }
