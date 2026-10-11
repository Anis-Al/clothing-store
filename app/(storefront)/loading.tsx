// Shown while any storefront page loads (all pages are dynamic): flat soft-cloud tiles, Nike-style.
export default function Loading() {
  return (
    <div aria-busy="true" className="grid animate-pulse grid-cols-1 gap-x-2 gap-y-10 py-6 min-[600px]:grid-cols-2 min-[1024px]:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex flex-col gap-3">
          <div className="aspect-square bg-cloud" />
          <div className="h-4 w-2/3 bg-cloud" />
          <div className="h-4 w-1/3 bg-cloud" />
        </div>
      ))}
    </div>
  )
}
