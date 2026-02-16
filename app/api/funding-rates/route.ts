import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'

export const dynamic = 'force-dynamic'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
})

let cache: { data: any; timestamp: number; days: number } | null = null
const CACHE_TTL = 5 * 60 * 1000

function calculateAPR(rateSum: number, days: number): number {
  return rateSum * (365 / days) * 100
}

function rateSumToPercent(rateSum: number): number {
  return rateSum * 100
}

function getExchangeDisplayName(exchange: string): string {
  if (exchange.startsWith('hl-')) {
    return `HL-${exchange.substring(3)}`
  }
  return exchange.charAt(0).toUpperCase() + exchange.slice(1)
}

async function getReferenceTimestamps(symbol: string, startDate: Date, endDate: Date) {
  try {
    const result = await pool.query(
      'SELECT * FROM get_reference_timestamps($1, $2, $3)',
      [symbol, startDate.toISOString(), endDate.toISOString()]
    )
    return result.rows
  } catch (error) {
    console.error(`Error getting reference timestamps for ${symbol}:`, error)
    return []
  }
}

async function getExchangeStatus() {
  try {
    const result = await pool.query('SELECT * FROM get_exchange_status()')
    const status: { [key: string]: any } = {}
    
    for (const row of result.rows) {
      status[row.exchange] = {
        status: row.hours_since_update < 2 ? 'healthy' : 
                row.hours_since_update < 6 ? 'warning' : 'error',
        lastUpdate: row.last_update,
        count: row.symbol_count
      }
    }
    
    return status
  } catch (error) {
    console.error('Error getting exchange status:', error)
    return {}
  }
}

async function getStockSymbols() {
  try {
    const result = await pool.query('SELECT * FROM get_stock_symbols()')
    return result.rows.map((row: any) => row.symbol)
  } catch (error) {
    console.error('Error getting stock symbols:', error)
    return []
  }
}

async function getOIData() {
  try {
    const result = await pool.query(`
      SELECT DISTINCT ON (symbol) symbol, oi_usd 
      FROM oi_data 
      ORDER BY symbol, timestamp DESC
    `)
    
    const oiData: { [key: string]: number } = {}
    for (const row of result.rows) {
      oiData[row.symbol] = parseFloat(row.oi_usd) || 0
    }
    
    return oiData
  } catch (error) {
    console.error('Error getting OI data:', error)
    return {}
  }
}

async function processSymbolData(symbol: string, exchanges: string[], endTime: Date, days: number) {
  try {
    const startTime = new Date(endTime.getTime() - (days * 24 * 60 * 60 * 1000))
    const refTimestamps = await getReferenceTimestamps(symbol, startTime, endTime)
    
    let actualStart: Date
    let actualEnd: Date
    
    if (refTimestamps.length > 0) {
      actualStart = new Date(refTimestamps[0].funding_time)
      actualEnd = new Date(refTimestamps[refTimestamps.length - 1].funding_time)
    } else {
      actualStart = startTime
      actualEnd = endTime
    }
    
    const symbolData: { [exchange: string]: { apr: number; rawPercent: number } } = {}
    
    for (const exchange of exchanges) {
      try {
        const result = await pool.query(`
          SELECT SUM(funding_rate) as rate_sum 
          FROM funding_rates 
          WHERE exchange = $1 
            AND symbol = $2 
            AND funding_time >= $3 
            AND funding_time <= $4
        `, [exchange, symbol, actualStart.toISOString(), actualEnd.toISOString()])
        
        const rateSum = parseFloat(result.rows[0]?.rate_sum || 0)
        const actualDays = Math.max(1, (actualEnd.getTime() - actualStart.getTime()) / (24 * 60 * 60 * 1000))
        
        symbolData[exchange] = {
          apr: calculateAPR(rateSum, actualDays),
          rawPercent: rateSumToPercent(rateSum)
        }
      } catch (error) {
        console.error(`Error getting rates for ${exchange}-${symbol}:`, error)
        symbolData[exchange] = { apr: 0, rawPercent: 0 }
      }
    }
    
    return symbolData
  } catch (error) {
    console.error(`Error processing symbol ${symbol}:`, error)
    return {}
  }
}

function findBestWorstCells(matrix: any, symbols: string[], exchanges: string[]) {
  let bestAPR = -Infinity
  let worstAPR = Infinity
  let bestCells: string[] = []
  let worstCells: string[] = []
  
  for (const symbol of symbols) {
    for (const exchange of exchanges) {
      const cellData = matrix[symbol]?.[exchange]
      if (cellData) {
        const apr = cellData.apr
        if (apr > bestAPR) {
          bestAPR = apr
          bestCells = [`${symbol}-${exchange}`]
        } else if (apr === bestAPR) {
          bestCells.push(`${symbol}-${exchange}`)
        }
        if (apr < worstAPR) {
          worstAPR = apr
          worstCells = [`${symbol}-${exchange}`]
        } else if (apr === worstAPR) {
          worstCells.push(`${symbol}-${exchange}`)
        }
      }
    }
  }
  
  for (const symbol of symbols) {
    for (const exchange of exchanges) {
      if (matrix[symbol]?.[exchange]) {
        const cellKey = `${symbol}-${exchange}`
        matrix[symbol][exchange].isBest = bestCells.includes(cellKey)
        matrix[symbol][exchange].isWorst = worstCells.includes(cellKey)
      }
    }
  }
}

function calculateArbitrageOpportunities(matrix: any, symbols: string[], exchanges: string[]) {
  const opportunities: any[] = []
  
  for (const symbol of symbols) {
    const symbolData = matrix[symbol]
    if (!symbolData) continue
    
    const availableExchanges = exchanges.filter(ex => symbolData[ex])
    if (availableExchanges.length < 2) continue
    
    for (let i = 0; i < availableExchanges.length; i++) {
      for (let j = i + 1; j < availableExchanges.length; j++) {
        const ex1 = availableExchanges[i]
        const ex2 = availableExchanges[j]
        
        const apr1 = symbolData[ex1].apr
        const apr2 = symbolData[ex2].apr
        
        const diff = Math.abs(apr1 - apr2)
        
        if (diff >= 0.5) {
          const longExchange = apr1 < apr2 ? ex1 : ex2
          const shortExchange = apr1 < apr2 ? ex2 : ex1
          const longRate = apr1 < apr2 ? apr1 : apr2
          const shortRate = apr1 < apr2 ? apr2 : apr1
          
          opportunities.push({
            symbol,
            longExchange: getExchangeDisplayName(longExchange),
            shortExchange: getExchangeDisplayName(shortExchange),
            longRate,
            shortRate,
            netCollection: diff
          })
        }
      }
    }
  }
  
  return opportunities
    .sort((a: any, b: any) => b.netCollection - a.netCollection)
    .slice(0, 20)
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get('days') || '7')
    
    const now = Date.now()
    if (cache && cache.days === days && (now - cache.timestamp) < CACHE_TTL) {
      return NextResponse.json(cache.data)
    }
    
    const symbolsResult = await pool.query(`
      SELECT DISTINCT symbol FROM funding_rates 
      ORDER BY symbol
    `)
    const symbols = symbolsResult.rows.map((row: any) => row.symbol)
    
    const exchangesResult = await pool.query(`
      SELECT DISTINCT exchange FROM funding_rates 
      ORDER BY exchange
    `)
    const exchanges = exchangesResult.rows.map((row: any) => row.exchange)
    
    const [exchangeStatus, stockSymbols, oiData] = await Promise.all([
      getExchangeStatus(),
      getStockSymbols(),
      getOIData()
    ])
    
    const endTime = new Date()
    const matrix: any = {}
    
    const batchSize = 10
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize)
      const batchPromises = batch.map((symbol: string) => 
        processSymbolData(symbol, exchanges, endTime, days)
          .then(data => ({ symbol, data }))
      )
      
      const batchResults = await Promise.all(batchPromises)
      
      for (const { symbol, data } of batchResults) {
        matrix[symbol] = data
      }
    }
    
    findBestWorstCells(matrix, symbols, exchanges)
    
    const arbitrageOpportunities = calculateArbitrageOpportunities(matrix, symbols, exchanges)
    
    const responseData = {
      matrix,
      exchanges: exchanges.map(getExchangeDisplayName),
      exchangeStatus,
      oiData,
      stockSymbols,
      arbitrageOpportunities
    }
    
    cache = { data: responseData, timestamp: now, days }
    
    return NextResponse.json(responseData)
  } catch (error) {
    console.error('Error in funding-rates API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
