'use client'

import { useState } from 'react'

interface ExchangeStatusData {
  [exchange: string]: {
    status: 'healthy' | 'warning' | 'error'
    lastUpdate: string
    count: number
  }
}

interface ExchangeStatusProps {
  exchangeStatus: ExchangeStatusData
}

export default function ExchangeStatus({ exchangeStatus }: ExchangeStatusProps) {
  const [expanded, setExpanded] = useState(false)
  
  const exchanges = Object.keys(exchangeStatus).sort()
  const healthyCount = exchanges.filter(ex => exchangeStatus[ex]?.status === 'healthy').length
  const warningCount = exchanges.filter(ex => exchangeStatus[ex]?.status === 'warning').length
  const errorCount = exchanges.filter(ex => exchangeStatus[ex]?.status === 'error').length
  
  const getStatusClass = (status: string) => {
    switch (status) {
      case 'healthy': return 'status-healthy'
      case 'warning': return 'status-warning'
      case 'error': return 'status-error'
      default: return 'status-error'
    }
  }
  
  const getExchangeDisplayName = (exchange: string) => {
    if (exchange.startsWith('hl-')) return `HL-${exchange.substring(3)}`
    return exchange.charAt(0).toUpperCase() + exchange.slice(1)
  }
  
  const formatLastUpdate = (dateString: string) => {
    try {
      const date = new Date(dateString)
      const now = new Date()
      const diffMs = now.getTime() - date.getTime()
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
      const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
      if (diffHours > 0) return `${diffHours}h ${diffMinutes}m ago`
      return `${diffMinutes}m ago`
    } catch {
      return 'Unknown'
    }
  }
  
  return (
    <div className="exchange-status">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-semibold">Exchange Health Status</h3>
          <div className="flex gap-2">
            <span className="status-item status-healthy">✓ {healthyCount} Healthy</span>
            {warningCount > 0 && <span className="status-item status-warning">⚠ {warningCount} Warning</span>}
            {errorCount > 0 && <span className="status-item status-error">✗ {errorCount} Error</span>}
          </div>
        </div>
        <button onClick={() => setExpanded(!expanded)} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          {expanded ? 'Hide Details' : 'Show Details'}
        </button>
      </div>
      
      <div className="text-sm text-muted-foreground mb-2">
        {exchanges.length} exchanges monitored • Last updated: {new Date().toLocaleTimeString()}
      </div>
      
      {expanded && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mt-4">
          {exchanges.map(exchange => {
            const status = exchangeStatus[exchange]
            if (!status) return null
            return (
              <div key={exchange} className={`p-3 rounded border ${getStatusClass(status.status)} bg-opacity-10`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium">{getExchangeDisplayName(exchange)}</span>
                  <span className={`text-xs px-2 py-1 rounded ${getStatusClass(status.status)}`}>{status.status.toUpperCase()}</span>
                </div>
                <div className="text-xs space-y-1">
                  <div>Symbols: {status.count}</div>
                  <div>Updated: {formatLastUpdate(status.lastUpdate)}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
      
      {!expanded && (
        <div className="flex flex-wrap gap-1 mt-2">
          {exchanges.slice(0, 10).map(exchange => {
            const status = exchangeStatus[exchange]
            if (!status) return null
            return (
              <span key={exchange} className={`status-item ${getStatusClass(status.status)} text-xs`}
                title={`${getExchangeDisplayName(exchange)}: ${status.status} (${status.count} symbols)`}>
                {getExchangeDisplayName(exchange)}
              </span>
            )
          })}
          {exchanges.length > 10 && <span className="text-xs text-muted-foreground px-2 py-1">+{exchanges.length - 10} more</span>}
        </div>
      )}
    </div>
  )
}
