import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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
    const { data, error } = await supabase.rpc('get_reference_timestamps', {
      p_symbol: symbol,
      p_start: startDate.toISOString(),
      p_end: endDate.toISOString()
    })
    if (error) throw error
    return data || []
  } catch (error) {
    console.error(`Error getting reference timestamps for ${symbol}:`, error)
    return []
  }
}

async function getExchangeStatus() {
  try {
    const { data, error } = await supabase.rpc('get_exchange_status')
    if (error) throw error
    
    const status: { [key: string]: any } = {}
    for (const row of (data || [])) {
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
    const { data, error } = await supabase.rpc('get_stock_symbols')
    if (error) throw error
    return (data || []).map((row: any) => row.symbol)
  } catch (error) {
    console.error('Error getting stock symbols:', error)
    return []
  }
}

async function getOIData() {
  try {
    const { data, error } = await supabase
      .from('oi_data')
      .select('symbol, oi_usd, timestamp')
      .order('timestamp', { ascending: false })
    
    if (error) throw error
    
    const oiData: { [key: string]: number } = {}
    for (const row of (data || [])) {
      if (!oiData[row.symbol]) {
        oiData[row.symbol] = parseFloat(row.oi_usd) || 0
      }
    }
    return oiData
  } catch (error) {
    console.error('Error getting OI data:', error)
    return {}
  }
}

async function getFundingRatesSum(exchange: string, symbol: string, startTime: Date, endTime: Date): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('funding_rates')
      .select('funding_rate')
      .eq('exchange', exchange)
      .eq('symbol', symbol)
      .gte('funding_time', startTime.toISOString())
      .lte('funding_time', endTime.toISOString())

    if (error) throw error
    
    let sum = 0
    for (const row of (data || [])) {
      sum += parseFloat(row.funding_rate) || 0
    }
    return sum
  } catch (error) {
    console.error(`Error getting rates for ${exchange}-${symbol}:`, error)
    return 0
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
    
    const exchangePromises = exchanges.map(async (exchange) => {
      const rateSum = await getFundingRatesSum(exchange, symbol, actualStart, actualEnd)
      const actualDays = Math.max(1, (actualEnd.getTime() - actualStart.getTime()) / (24 * 60 * 60 * 1000))
      return {
        exchange,
        apr: calculateAPR(rateSum, actualDays),
        rawPercent: rateSumToPercent(rateSum)
      }
    })
    
    const results = await Promise.all(exchangePromises)
    for (const r of results) {
      symbolData[r.exchange] = { apr: r.apr, rawPercent: r.rawPercent }
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
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Missing env vars:', {
        hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        hasKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY
      })
      return NextResponse.json(
        { error: 'Server configuration error: missing Supabase credentials' },
        { status: 500 }
      )
    }

    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get('days') || '7')
    
    const now = Date.now()
    if (cache && cache.days === days && (now - cache.timestamp) < CACHE_TTL) {
      return NextResponse.json(cache.data)
    }
    
    const { data: symbolsData, error: symbolsError } = await supabase
      .from('funding_rates')
      .select('symbol')
    
    if (symbolsError) throw symbolsError
    
    const symbolSet = new Set((symbolsData || []).map((r: any) => r.symbol))
    const symbols = Array.from(symbolSet).sort() as string[]
    
    const { data: exchangesData, error: exchangesError } = await supabase
      .from('funding_rates')
      .select('exchange')
    
    if (exchangesError) throw exchangesError
    
    const exchangeSet = new Set((exchangesData || []).map((r: any) => r.exchange))
    const exchanges = Array.from(exchangeSet).sort() as string[]
    
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
  } catch (error: any) {
    console.error('Error in funding-rates API:', {
      message: error?.message,
      stack: error?.stack,
      cause: error?.cause
    })
    return NextResponse.json(
      { error: 'Internal server error', message: error?.message ?? 'unknown' },
      { status: 500 }
    )
  }
}
