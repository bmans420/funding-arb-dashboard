'use client'

interface Timeframe {
  label: string
  value: number
}

interface TimeframeBarProps {
  timeframes: Timeframe[]
  selectedDays: number
  onTimeframeChange: (days: number) => void
}

export default function TimeframeBar({ timeframes, selectedDays, onTimeframeChange }: TimeframeBarProps) {
  return (
    <div className="timeframe-bar">
      {timeframes.map(timeframe => (
        <button
          key={timeframe.value}
          onClick={() => onTimeframeChange(timeframe.value)}
          className={`timeframe-button ${selectedDays === timeframe.value ? 'active' : ''}`}
        >
          {timeframe.label}
        </button>
      ))}
    </div>
  )
}
