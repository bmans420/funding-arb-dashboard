'use client'

interface MatrixData {
  [symbol: string]: {
    [exchange: string]: {
      apr: number
      rawPercent: number
      isBest: boolean
      isWorst: boolean
    }
  }
}

interface FundingMatrixProps {
  matrix: MatrixData
  exchanges: string[]
  filteredSymbols: string[]
  sortColumn: string
  sortDirection: 'asc' | 'desc'
  onSort: (column: string) => void
}

function getColorIntensity(apr: number): number {
  return Math.min(Math.abs(apr) / 100, 1.0)
}

function getGreenColors(intensity: number) {
  const i = intensity
  return {
    backgroundColor: `rgb(${22 + i * 10}, ${27 + i * 50}, ${34 + i * 15})`,
    color: `rgb(${60 + i * 140}, ${180 + i * 75}, ${80 + i * 50})`
  }
}

function getRedColors(intensity: number) {
  const i = intensity
  return {
    backgroundColor: `rgb(${22 + i * 60}, ${27 + i * 5}, ${34 + i * 5})`,
    color: `rgb(${200 + i * 48}, ${80 + i * 20}, ${70 + i * 20})`
  }
}

function getCellStyle(cellData: any) {
  if (!cellData) return {}
  
  const { apr } = cellData
  const intensity = getColorIntensity(apr)
  
  const baseStyle = apr >= 0 ? getGreenColors(intensity) : getRedColors(intensity)
  
  if (cellData.isBest) {
    return { ...baseStyle, border: '2px solid #3fb950' }
  }
  if (cellData.isWorst) {
    return { ...baseStyle, border: '2px solid #f85149' }
  }
  
  return baseStyle
}

function sortSymbols(symbols: string[], matrix: MatrixData, sortColumn: string, sortDirection: 'asc' | 'desc') {
  if (!sortColumn || sortColumn === 'symbol') {
    const sorted = [...symbols].sort()
    return sortDirection === 'desc' ? sorted.reverse() : sorted
  }
  
  return [...symbols].sort((a, b) => {
    const aData = matrix[a]?.[sortColumn]
    const bData = matrix[b]?.[sortColumn]
    
    if (!aData && !bData) return 0
    if (!aData) return 1
    if (!bData) return -1
    
    const comparison = aData.apr - bData.apr
    return sortDirection === 'desc' ? -comparison : comparison
  })
}

export default function FundingMatrix({ 
  matrix, exchanges, filteredSymbols, sortColumn, sortDirection, onSort 
}: FundingMatrixProps) {
  const sortedSymbols = sortSymbols(filteredSymbols, matrix, sortColumn, sortDirection)
  
  const getSortClass = (column: string) => {
    if (sortColumn !== column) return 'sortable'
    return sortDirection === 'asc' ? 'sort-asc' : 'sort-desc'
  }
  
  return (
    <div>
      <table className="matrix-table">
        <thead>
          <tr>
            <th className={getSortClass('symbol')} onClick={() => onSort('symbol')} style={{ position: 'sticky', top: 0, left: 0, zIndex: 20, background: '#21262d' }}>
              Symbol
            </th>
            {exchanges.map(exchange => (
              <th key={exchange} className={getSortClass(exchange)} onClick={() => onSort(exchange)} style={{ position: 'sticky', top: 0, zIndex: 10, background: '#21262d' }}>
                {exchange}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedSymbols.map(symbol => (
            <tr key={symbol}>
              <td className="symbol-cell">{symbol}</td>
              {exchanges.map(exchange => {
                const cellData = matrix[symbol]?.[exchange]
                if (!cellData) {
                  return <td key={`${symbol}-${exchange}`} className="matrix-cell">-</td>
                }
                return (
                  <td
                    key={`${symbol}-${exchange}`}
                    className={`matrix-cell ${cellData.isBest ? 'best-cell' : ''} ${cellData.isWorst ? 'worst-cell' : ''}`}
                    style={getCellStyle(cellData)}
                    title={`APR: ${cellData.apr.toFixed(2)}%\nRaw: ${cellData.rawPercent.toFixed(4)}%`}
                  >
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 600 }}>{cellData.apr.toFixed(2)}%</div>
                      <div style={{ fontSize: '10px', opacity: 0.8 }}>{cellData.rawPercent.toFixed(4)}%</div>
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {sortedSymbols.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          No symbols match the current filters.
        </div>
      )}
    </div>
  )
}
