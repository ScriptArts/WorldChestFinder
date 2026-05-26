import * as React from 'react'
import * as SeparatorPrimitive from '@radix-ui/react-separator'
import { cn } from '@renderer/lib/utils'

function Separator({
  className,
  orientation = 'horizontal',
  decorative = true,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>): JSX.Element {
  let orientationClass: string
  // 区切り線の向きに合わせて幅と高さを切り替える
  if (orientation === 'horizontal') {
    orientationClass = 'h-px w-full'
  } else {
    orientationClass = 'h-full w-px'
  }

  return (
    <SeparatorPrimitive.Root
      decorative={decorative}
      orientation={orientation}
      className={cn(
        'shrink-0 bg-border',
        orientationClass,
        className
      )}
      {...props}
    />
  )
}

export { Separator }
