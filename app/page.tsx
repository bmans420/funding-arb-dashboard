'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import FundingMatrix from '@/components/FundingMatrix'
import ArbitrageTable from '@/components/ArbitrageTable'
import ExchangeStatus from '@/components/ExchangeStatus'
import TimeframeBar from '@/components/TimeframeBar'

interface FundingData {
  matrix: {
    [symbol: string]: {
      [exchange: string]: {
        apr: number
        rawPercent: number
        isBest: boolean
        isWorst: boolean
      }
    }
  }
  exchanges: string[]
  exchangeStatus: {
    [exchange: string]: {
      status: 'healthy' | 'warning' | 'error'
      lastUpdate: string
      count: number
    }
  }
  oiData: {
    [symbol: string]: number
  }
  stockSymbols: string[]
  arbitrageOpportunities: {
    symbol: string
    longExchange: string
    shortExchange: string
    longRate: number
    shortRate: number
    netCollection: number
  }[]
}

function DashboardContent() {
  const [data, setData] = useState<FundingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedExchanges, setSelectedExchanges] = useState<string[]>([])
  const [stocksOnly, setStocksOnly] = useState(false)
  const [top10OI, setTop10OI] = useState(false)
  const [sortColumn, setSortColumn] = useState<string>('')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  
  const days = parseInt(searchParams.get('days') || '7')

  const timeframes = [
    { label: '1d', value: 1 },
    { label: '3d', value: 3 },
    { label: '7d', value: 7 },
    { label: '15d', value: 15 },
    { label: '30d', value: 30 },
    { label: '60d', value: 60 },
    { label: '90d', value: 90 },
    { label: '180d', value: 180 },
    { label: '270d', value: 270 },
    { label: '360d', value: 360 },
  ]

  const updateSearchParams = (key: string, value: string) => {
    const current = new URLSearchParams(Array.from(searchParams.entries()))
    current.set(key, value)
    router.push(`${pathname}?${current.toString()}`)
  }

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const response = await fetch(`/api/funding-rates?days=${days}`)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const result = await response.json()
      setData(result)
      
      if (selectedExchanges.length === 0 && result.exchanges?.length > 0) {
        setSelectedExchanges(result.exchanges)
      }
    } catch (err) {
      console.error('Error fetching data:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [days])

  const handleTimeframeChange = (newDays: number) => {
    updateSearchParams('days', newDays.toString())
  }

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('desc')
    }
  }

  const filteredSymbols = data ? Object.keys(data.matrix).filter(symbol => {
    if (searchTerm && !symbol.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false
    }
    if (stocksOnly && !data.stockSymbols.includes(symbol)) {
      return false
    }
    if (top10OI) {
      const sortedByOI = Object.keys(data.oiData)
        .sort((a, b) => (data.oiData[b] || 0) - (data.oiData[a] || 0))
        .slice(0, 10)
      if (!sortedByOI.includes(symbol)) {
        return false
      }
    }
    return true
  }) : []

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="loading-spinner"></div>
          <p className="mt-4 text-muted-foreground">Loading funding rates data...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="error-message max-w-md">
          <h2 className="text-lg font-semibold mb-2">Error Loading Data</h2>
          <p>{error}</p>
          <button 
            onClick={fetchData}
            className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 max-w-[1400px] mx-auto">
      <header className="mb-4">
        <h1 className="text-3xl font-bold mb-1">Funding Rates Dashboard</h1>
        <p className="text-muted-foreground">
          Real-time cryptocurrency funding rates and arbitrage opportunities
        </p>
      </header>

      {data && (
        <>
          <ExchangeStatus exchangeStatus={data.exchangeStatus} />

          <TimeframeBar
            timeframes={timeframes}
            selectedDays={days}
            onTimeframeChange={handleTimeframeChange}
          />

          <div className="search-container">
            <input
              type="text"
              placeholder="Search assets..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>

          <div style={{ maxHeight: '55vh', overflowY: 'auto', overflowX: 'auto', marginBottom: '2rem' }}>
            <FundingMatrix
              matrix={data.matrix}
              exchanges={data.exchanges}
              filteredSymbols={filteredSymbols}
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={handleSort}
            />
          </div>

          <div style={{ maxHeight: '45vh', overflowY: 'auto' }}>
            <ArbitrageTable
              arbitrageOpportunities={data.arbitrageOpportunities}
              exchanges={data.exchanges}
              selectedExchanges={selectedExchanges}
              onExchangeToggle={(exchange) => {
                if (selectedExchanges.includes(exchange)) {
                  setSelectedExchanges(selectedExchanges.filter(e => e !== exchange))
                } else {
                  setSelectedExchanges([...selectedExchanges, exchange])
                }
              }}
              stocksOnly={stocksOnly}
              onStocksOnlyToggle={setStocksOnly}
              top10OI={top10OI}
              onTop10OIToggle={setTop10OI}
              filteredSymbols={filteredSymbols}
              stockSymbols={data.stockSymbols}
              oiData={data.oiData}
            />
          </div>
        </>
      )}
    </div>
  )
}

export default function HomePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="loading-spinner"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    }>
      <DashboardContent />
    </Suspense>
  )
}
