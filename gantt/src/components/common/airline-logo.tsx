import { useMemo } from 'react'
import { Plane } from 'lucide-react'

// Import available airline logos
import f8Logo from '@/assets/images/logo/f8.png'

const LOGO_MAP: Record<string, string> = {
  f8: f8Logo,
  // Add more airlines as needed
}

interface AirlineLogoProps {
  /** Airline schema code (e.g. 'f8', 'tg') */
  schema?: string
  /** Logo height in pixels */
  height?: number
  /** Optional className for additional styling */
  className?: string
  /** Fallback to generic logo if airline logo not found */
  fallback?: 'plane' | 'text' | 'none'
}

/**
 * Airline logo component.
 * Shows airline-specific logo when available, fallback otherwise.
 */
export const AirlineLogo = ({
  schema,
  height = 32,
  className = '',
  fallback = 'plane',
}: AirlineLogoProps) => {
  const logoSrc = useMemo(() => {
    if (schema && LOGO_MAP[schema.toLowerCase()]) {
      return LOGO_MAP[schema.toLowerCase()]
    }
    return null
  }, [schema])

  if (logoSrc) {
    return (
      <img
        src={logoSrc}
        alt={`${schema?.toUpperCase()} logo`}
        height={height}
        style={{ height, width: 'auto', maxWidth: height * 2 }}
        className={`object-contain ${className}`}
      />
    )
  }

  // Fallback: just return null if 'none'
  if (fallback === 'none') return null

  // Fallback: show Plane icon
  if (fallback === 'plane') {
    return (
      <Plane
        height={height}
        className={`text-primary ${className}`}
        style={{ height, width: height }}
      />
    )
  }

  // For now, return null - let parent component handle fallback styling
  return null
}

/**
 * Check if logo exists for a given schema.
 */
export const hasLogo = (schema: string): boolean => {
  return !!LOGO_MAP[schema.toLowerCase()]
}