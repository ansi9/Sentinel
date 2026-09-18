import React, { ReactNode } from 'react'
import clsx from 'clsx'

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon?: ReactNode
  tone?: 'default' | 'emerald' | 'amber' | 'rose' | 'cyan'
  className?: string
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  tone = 'default',
  className,
}) => {
  const toneClasses = {
    default: 'border-zinc-800 bg-zinc-900/60 text-zinc-100',
    emerald: 'border-emerald-800/40 bg-emerald-950/20 text-emerald-300',
    amber: 'border-amber-800/40 bg-amber-950/20 text-amber-300',
    rose: 'border-rose-800/40 bg-rose-950/20 text-rose-300',
    cyan: 'border-cyan-800/40 bg-cyan-950/20 text-cyan-300',
  }[tone]

  return (
    <div className={clsx('relative overflow-hidden rounded border p-4 font-mono shadow-sm', toneClasses, className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">{title}</span>
        {icon && <div className="text-zinc-400">{icon}</div>}
      </div>
      <div className="mt-2 text-2xl font-bold tracking-tight">{value}</div>
      {subtitle && <p className="mt-1 text-xs text-zinc-400 truncate">{subtitle}</p>}
    </div>
  )
}
