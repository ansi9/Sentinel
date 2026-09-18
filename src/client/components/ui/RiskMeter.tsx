import React from 'react'
import clsx from 'clsx'

interface RiskMeterProps {
  score: number
  showLabel?: boolean
  className?: string
}

export const RiskMeter: React.FC<RiskMeterProps> = ({ score, showLabel = true, className }) => {
  const clamped = Math.min(100, Math.max(0, score))

  let barColor = 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)]'
  let textColor = 'text-emerald-400'
  let label = 'LOW THREAT'

  if (clamped >= 60) {
    barColor = 'bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.6)]'
    textColor = 'text-rose-400'
    label = 'CRITICAL RISK'
  } else if (clamped >= 25) {
    barColor = 'bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.5)]'
    textColor = 'text-amber-400'
    label = 'ELEVATED RISK'
  }

  return (
    <div className={clsx('w-full space-y-1.5 font-mono', className)}>
      {showLabel && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-zinc-400 font-semibold tracking-wider">AGGREGATE RISK INDEX</span>
          <span className={clsx('font-bold tracking-widest', textColor)}>
            {label} ({clamped.toFixed(1)}/100)
          </span>
        </div>
      )}
      <div className="h-2.5 w-full overflow-hidden rounded-sm bg-zinc-900 border border-zinc-800">
        <div
          className={clsx('h-full transition-all duration-700 ease-out', barColor)}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  )
}
