import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

// Nike: pill or circular icon — the only two button shapes. Pressed = slight tap collapse.
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap transition-[transform,opacity,background-color] outline-none select-none active:scale-[0.97] active:opacity-70 disabled:pointer-events-none disabled:bg-hairline-soft disabled:text-stone [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        default: "bg-ink text-canvas hover:bg-charcoal",
        secondary: "bg-cloud text-ink hover:bg-hairline-soft",
        outline: "border border-hairline bg-canvas text-ink hover:border-ink",
        ghost: "text-ink hover:bg-cloud disabled:bg-transparent",
        destructive: "text-sale hover:bg-cloud",
        link: "rounded-none text-ink underline underline-offset-4",
      },
      size: {
        default: "h-12 px-8 text-base",
        sm: "h-10 px-4 text-sm",
        xs: "h-8 px-3 text-xs",
        icon: "size-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return <ButtonPrimitive data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />
}

export { Button, buttonVariants }
