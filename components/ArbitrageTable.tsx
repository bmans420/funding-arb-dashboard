'use client'

interface ArbitrageOpportunity {
  symbol: string
  longExchange: string
  shortExchange: string
  longRate: number
  shortRate: number
  netCollection: number
}

interface ArbitrageTableProps {
  arbitrageOpportunities: ArbitrageOpportunity[]
  exchanges: string[]
  selectedExchanges: string[]
  onExchangeToggle: (exchange: string) => void
  stocksOnly: boolean
  onStocksOnlyToggle: (value: boolean) => void
  top10OI: boolean
  onTop10OIToggle: (value: boolean) => void
  filteredSymbols: string[]
  stockSymbols: string[]
  oiData: { [symbol: string]: number }
}

export default function ArbitrageTable({
  arbitrageOpportunities, exchanges, selectedExchanges, onExchangeToggle,
  stocksOnly, onStocksOnlyToggle, top10OI, onTop10OIToggle,
  filteredSymbols, stockSymbols, oiData
}: ArbitrageTableProps) {
  
  const filteredOpportunities = arbitrageOpportunities.filter(opp => {
    const longSelected = selectedExchanges.some(ex => 
      ex === opp.longExchange || ex.toLowerCase() === opp.longExchange.toLowerCase()
    )
    const shortSelected = selectedExchanges.some(ex => 
      ex === opp.shortExchange || ex.toLowerCase() === opp.shortExchange.toLowerCase()
    )
    if (!longSelected || !shortSelected) return false
    if (stocksOnly && !stockSymbols.includes(opp.symbol)) return false
    if (top10OI) {
      const top10Symbols = Object.keys(oiData)
        .sort((a, b) => (oiData[b] || 0) - (oiData[a] || 0))
        .slice(0, 10)
      if (!top10Symbols.includes(opp.symbol)) return false
    }
    return filteredSymbols.includes(opp.symbol)
  })
  
  const formatNumber = (num: number) => {
    if (Math.abs(num) >= 1000000000) return (num / 1000000000).toFixed(2) + 'B'
    if (Math.abs(num) >= 1000000) return (num / 1000000).toFixed(2) + 'M'
    if (Math.abs(num) >= 1000) return (num / 1000).toFixed(2) + 'K'
    return num.toFixed(2)
  }
  
  return (
    <section>
      <h2 className="text-2xl font-bold mb-4">Arbitrage Opportunities</h2>
      
      <div className="filter-container">
        <div className="checkbox-group">
          <div className="checkbox-item">
            <input type="checkbox" id="stocks-only" checked={stocksOnly} onChange={(e) => onStocksOnlyToggle(e.target.checked)} />
            <label htmlFor="stocks-only">Stocks Only</label>
          </div>
          <div className="checkbox-item">
            <input type="checkbox" id="top10-oi" checked={top10OI} onChange={(e) => onTop10OIToggle(e.target.checked)} />
            <label htmlFor="top10-oi">Top 10 OI</label>
          </div>
        </div>
      </div>
      
      <div className="filter-container">
        <div className="text-sm font-medium mb-2">Exchange Filters:</div>
        <div className="checkbox-group">
          {exchanges.map(exchange => (
            <div key={exchange} className="checkbox-item">
              <input type="checkbox" id={`exchange-${exchange}`} checked={selectedExchanges.includes(exchange)} onChange={() => onExchangeToggle(exchange)} />
              <label htmlFor={`exchange-${exchange}`}>{exchange}</label>
            </div>
          ))}
        </div>
      </div>
      
      <div className="matrix-container">
        <table className="arbitrage-table">
          <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
            <tr>
              <th>Symbol</th>
              <th>Long Position</th>
              <th>Short Position</th>
              <th>Long Rate (%)</th>
              <th>Short Rate (%)</th>
              <th>Net Collection (%)</th>
              <th>OI (USD)</th>
            </tr>
          </thead>
          <tbody>
            {filteredOpportunities.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-8 text-muted-foreground">
                  No arbitrage opportunities found with current filters.
                  <br /><small>Try adjusting exchange filters or other settings.</small>
                </td>
              </tr>
            ) : (
              filteredOpportunities.map((opp, index) => (
                <tr key={`${opp.symbol}-${opp.longExchange}-${opp.shortExchange}-${index}`}>
                  <td className="font-semibold">{opp.symbol}</td>
                  <td>{opp.longExchange}</td>
                  <td>{opp.shortExchange}</td>
                  <td style={{ color: opp.longRate >= 0 ? '#3fb950' : '#f85149' }}>{opp.longRate.toFixed(2)}%</td>
                  <td style={{ color: opp.shortRate >= 0 ? '#3fb950' : '#f85149' }}>{opp.shortRate.toFixed(2)}%</td>
                  <td style={{ color: '#3fb950', fontWeight: 600 }}>+{opp.netCollection.toFixed(2)}%</td>
                  <td>{oiData[opp.symbol] ? `$${formatNumber(oiData[opp.symbol])}` : 'N/A'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      
      {filteredOpportunities.length > 0 && (
        <div className="mt-4 text-sm text-muted-foreground">
          Showing {filteredOpportunities.length} arbitrage opportunities.
          <br />
          <strong>Strategy:</strong> Long the lower rate exchange, short the higher rate exchange to collect the net spread.
        </div>
      )}
    </section>
  )
}
