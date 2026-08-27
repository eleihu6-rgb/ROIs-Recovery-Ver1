// gantt/src/components/layout/drop-indicator.tsx

import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react'

interface DropIndicatorProps {
  position: 'top' | 'bottom' | 'left' | 'right'
}

export const DropIndicator = ({ position }: DropIndicatorProps) => {
  const getStyle = () => {
    switch (position) {
      case 'top':
        return 'absolute top-0 left-0 right-0 h-10 bg-primary/20 border-t-2 border-primary flex items-center justify-center'
      case 'bottom':
        return 'absolute bottom-0 left-0 right-0 h-10 bg-primary/20 border-b-2 border-primary flex items-center justify-center'
      case 'left':
        return 'absolute top-0 bottom-0 left-0 w-10 bg-primary/20 border-l-2 border-primary flex items-center justify-center'
      case 'right':
        return 'absolute top-0 bottom-0 right-0 w-10 bg-primary/20 border-r-2 border-primary flex items-center justify-center'
      default:
        return ''
    }
  }

  const ArrowIcon = () => {
    const iconClass = 'w-5 h-5 text-primary opacity-80'
    switch (position) {
      case 'top':
        return <ArrowUp className={iconClass} />
      case 'bottom':
        return <ArrowDown className={iconClass} />
      case 'left':
        return <ArrowLeft className={iconClass} />
      case 'right':
        return <ArrowRight className={iconClass} />
      default:
        return null
    }
  }

  return (
    <div className={getStyle()}>
      <ArrowIcon />
    </div>
  )
}