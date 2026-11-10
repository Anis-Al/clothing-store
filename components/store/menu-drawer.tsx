"use client"
import { useEffect, useRef } from "react"
import { Menu, X } from "lucide-react"

// Phones / tablets: the category menu behind a button (a native <details>), panel under the sticky header.
// Closes on a link tap (soft navigation keeps the DOM, so it would stay open), outside tap and Escape.
// Slides down on open (CSS, restarts whenever the panel is shown); closing waits for a short slide-up first
// (data-closing), since a <details> hides its content at once.
export function MenuDrawer({ label, children }: { label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null)
  const shut = () => {
    const d = ref.current
    if (!d?.open || d.dataset.closing) return
    d.dataset.closing = ""
    setTimeout(() => { d.open = false; delete d.dataset.closing }, 140)
  }
  useEffect(() => {
    const close = (e: Event) => { if (!ref.current?.contains(e.target as Node)) shut() }
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") shut() }
    document.addEventListener("pointerdown", close)
    document.addEventListener("keydown", esc)
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", esc) }
  }, [])
  return (
    <details ref={ref} className="group/menu lg:hidden">
      <summary aria-label={label} title={label} onClick={(e) => { if (ref.current?.open) { e.preventDefault(); shut() } }}
        className="-ms-2 grid size-10 cursor-pointer list-none place-items-center rounded-full hover:bg-cloud [&::-webkit-details-marker]:hidden">
        <Menu className="size-6 group-open/menu:hidden" />
        <X className="hidden size-6 group-open/menu:block motion-safe:group-open/menu:animate-in motion-safe:group-open/menu:spin-in-90 motion-safe:group-open/menu:fade-in" />
      </summary>
      <div onClick={(e) => { if ((e.target as Element).closest("a")) shut() }}
        className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 duration-200 group-data-closing/menu:fill-mode-forwards motion-safe:group-data-closing/menu:animate-out motion-safe:group-data-closing/menu:fade-out motion-safe:group-data-closing/menu:slide-out-to-top-2 group-data-closing/menu:duration-150 absolute inset-x-0 top-full max-h-[calc(100dvh-100px)] overflow-y-auto border-t border-hairline bg-canvas px-4 pb-6 shadow-[0_1px_0_var(--color-hairline)] md:px-12">
        {children}
      </div>
    </details>
  )
}
