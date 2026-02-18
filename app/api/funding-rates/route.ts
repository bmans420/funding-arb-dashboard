import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function getExchangeDisplayName(exchange: string): string {
  if (exchange.startsWith('hl-')) {
    return `HL-${exchange.substring(3)}`
  }
  return exchange.charAt(0).toUpperCase() + exchange.slice(1)
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

        const longExchange = apr1 < apr2 ? ex1 : ex2
        const shortExchange = apr1 < apr2 ? ex2 : ex1
        const longRate = apr1 < apr2 ? apr1 : apr2
        const shortRate = apr1 < apr2 ? apr2 : apr1

        opportunities.push({
          symbol,
          longExchange,
          shortExchange,
          longRate,
          shortRate,
          netCollection: diff
        })
      }
    }
  }

  return opportunities
    .sort((a: any, b: any) => b.netCollection - a.netCollection)
    .slice(0, 500)
}

export async function GET(request: NextRequest) {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Missing Supabase credentials' }, { status: 500 })
    }

    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get('days') || '7')

    const [matrixResult, exchangesResult, symbolsResult, statusResult, oiResult, stockResult] = await Promise.all([
      supabase.rpc('get_funding_matrix', { p_days: days }),
      supabase.rpc('get_all_exchanges'),
      supabase.rpc('get_all_symbols'),
      (async () => { try { return await supabase.rpc('get_exchange_status_v3', { cache_bust: Date.now() }); } catch { return { data: null }; } })(),
      supabase.from('oi_data').select('*'),
      (async () => { try { return await supabase.rpc('get_stock_symbols'); } catch { return { data: null }; } })()
    ])

    const matrix = matrixResult.data || {}
    const symbols = (symbolsResult.data || []).map((r: any) => r.symbol) as string[]
    const dbExchanges = (exchangesResult.data || []).map((r: any) => r.exchange) as string[]
    const matrixExchanges = new Set<string>()
    for (const symbol of Object.keys(matrix)) {
      for (const exchange of Object.keys(matrix[symbol])) {
        matrixExchanges.add(exchange)
      }
    }
    const exchanges = Array.from(new Set([...dbExchanges, ...Array.from(matrixExchanges)])).sort()
    const displayExchanges = exchanges.map(getExchangeDisplayName)

    // Transform matrix exchange keys to display names
    const transformedMatrix: any = {}
    for (const symbol of Object.keys(matrix)) {
      transformedMatrix[symbol] = {}
      for (const exchange of Object.keys(matrix[symbol])) {
        const displayName = getExchangeDisplayName(exchange)
        transformedMatrix[symbol][displayName] = matrix[symbol][exchange]
      }
    }

    // Exchange status
    const exchangeStatus: any = {}
    for (const row of (statusResult.data || [])) {
      const displayName = getExchangeDisplayName(row.exchange)
      exchangeStatus[displayName] = {
        status: row.hours_since_update < 2 ? 'healthy' :
                row.hours_since_update < 6 ? 'warning' : 'error',
        lastUpdate: row.last_update,
        count: row.symbol_count
      }
    }

    // OI data
    const oiData: any = {}
    for (const row of (oiResult.data || [])) {
      if (row.symbol && row.oi_usd != null) {
        oiData[row.symbol] = typeof row.oi_usd === 'number' ? row.oi_usd : parseFloat(row.oi_usd) || 0
      }
    }

    // Stock symbols
    const stockSymbols = (stockResult.data || []).map((r: any) => r.symbol)

    // Best/worst cells
    findBestWorstCells(transformedMatrix, symbols, displayExchanges)

    const arbitrageOpportunities = calculateArbitrageOpportunities(transformedMatrix, symbols, displayExchanges)

    const responseData = {
      matrix: transformedMatrix,
      exchanges: displayExchanges,
      exchangeStatus,
      oiData,
      stockSymbols,
      arbitrageOpportunities
    }

    return NextResponse.json(responseData)
  } catch (error: any) {
    console.error('Error in funding-rates API:', {
      message: error?.message,
      stack: error?.stack
    })
    return NextResponse.json(
      { error: 'Internal server error', message: error?.message ?? 'unknown' },
      { status: 500 }
    )
  }
}
