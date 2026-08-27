import * as React from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from 'lucide-react'
import { cn } from '@renderer/lib/utils'

function Select({ ...props }: React.ComponentProps<typeof SelectPrimitive.Root>): JSX.Element {
  return <SelectPrimitive.Root {...props} />
}

function SelectGroup({ ...props }: React.ComponentProps<typeof SelectPrimitive.Group>): JSX.Element {
  return <SelectPrimitive.Group {...props} />
}

function SelectValue({ ...props }: React.ComponentProps<typeof SelectPrimitive.Value>): JSX.Element {
  return <SelectPrimitive.Value {...props} />
}

function SelectTrigger({
  className,
  size = 'default',
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
  size?: 'sm' | 'default'
}): JSX.Element {
  let sizeClass: string
  // 指定されたサイズに応じてトリガーの高さを切り替える
  if (size === 'default') {
    sizeClass = 'h-7'
  } else {
    sizeClass = 'h-6'
  }

  return (
    <SelectPrimitive.Trigger
      className={cn(
        'flex w-full items-center justify-between gap-2 whitespace-nowrap rounded-md border border-input bg-card px-2 text-[13px] leading-none transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-40 data-[placeholder]:text-muted-foreground/70 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-3.5',
        sizeClass,
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon className="size-3.5 opacity-45" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  position = 'popper',
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>): JSX.Element {
  let popperClass: string | false
  // popper 配置の場合だけ位置補正クラスを追加する
  if (position === 'popper') {
    popperClass = 'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1'
  } else {
    popperClass = false
  }

  let viewportClass: string | false
  // popper 配置の場合だけトリガー幅に合わせる viewport クラスを追加する
  if (position === 'popper') {
    viewportClass = 'h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)] scroll-my-1'
  } else {
    viewportClass = false
  }

  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        className={cn(
          'relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border border-border-strong bg-popover text-popover-foreground shadow-[0_8px_24px_-8px_rgb(0_0_0/0.35)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
          popperClass,
          className
        )}
        position={position}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          className={cn(
            'p-1',
            viewportClass
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.Label>): JSX.Element {
  return <SelectPrimitive.Label className={cn('micro px-2 py-1.5 text-muted-foreground', className)} {...props} />
}

function SelectItem({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Item>): JSX.Element {
  return (
    <SelectPrimitive.Item
      className={cn(
        'relative flex w-full cursor-default select-none items-center rounded-sm py-1 pl-2 pr-7 text-[13px] outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
        className
      )}
      {...props}
    >
      <span className="absolute right-1.5 flex size-3.5 items-center justify-center text-primary">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="size-3.5" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.Separator>): JSX.Element {
  return <SelectPrimitive.Separator className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />
}

function SelectScrollUpButton({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>): JSX.Element {
  return (
    <SelectPrimitive.ScrollUpButton className={cn('flex cursor-default items-center justify-center py-1', className)} {...props}>
      <ChevronUpIcon className="size-4" />
    </SelectPrimitive.ScrollUpButton>
  )
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>): JSX.Element {
  return (
    <SelectPrimitive.ScrollDownButton className={cn('flex cursor-default items-center justify-center py-1', className)} {...props}>
      <ChevronDownIcon className="size-4" />
    </SelectPrimitive.ScrollDownButton>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue
}
