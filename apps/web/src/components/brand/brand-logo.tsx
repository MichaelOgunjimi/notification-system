import Image from "next/image"

type BrandLogoProps = {
  className?: string
  markClassName?: string
  labelClassName?: string
  showLabel?: boolean
  priority?: boolean
}

export default function BrandLogo({
  className = "",
  markClassName = "size-8",
  labelClassName = "text-[14px] font-semibold tracking-[-0.025em]",
  showLabel = true,
  priority = false,
}: BrandLogoProps) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span className={`relative block shrink-0 ${markClassName}`}>
        <Image
          src="/brand/png/beaco-mark-128.png"
          alt=""
          fill
          priority={priority}
          sizes="48px"
          className="object-contain"
        />
      </span>
      {showLabel ? <span className={labelClassName}>Beaco</span> : null}
    </span>
  )
}
