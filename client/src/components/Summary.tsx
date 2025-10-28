import { fmt } from '../utils/currency'
import { Results, Currency, ProductInput } from '../types'
import clsx from 'clsx'
import { DollarSign, TrendingUp, Percent } from 'lucide-react'
import MoneyValue from './MoneyValue'

export function SummaryCard({ title, currency, results, usdRate }: { title: string; currency: Currency; results: Results; usdRate: number }) {
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-soft min-w-0">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="mt-4 grid grid-cols-1 gap-5 text-base sm:grid-cols-2 md:grid-cols-3">
        <Row label="Revenue" icon={<DollarSign className="h-4 w-4" />}>
          <MoneyValue currency={currency} amount={results.revenue} usdRate={usdRate} />
        </Row>
        <Row label="Net revenue (after WHT)" icon={<DollarSign className="h-4 w-4" />}>
          <MoneyValue currency={currency} amount={results.netRevenue} usdRate={usdRate} />
        </Row>
        <Row label="WHT (2%)" icon={<DollarSign className="h-4 w-4" />} variant="warning">
          <MoneyValue currency={currency} amount={results.withholdingTax} usdRate={usdRate} />
        </Row>
        <Row label="Gross profit" icon={<TrendingUp className="h-4 w-4" />} highlight>
          <MoneyValue currency={currency} amount={results.grossProfit} usdRate={usdRate} primaryClassName="font-semibold text-emerald-900" />
        </Row>
        <Row label="Margin" icon={<Percent className="h-4 w-4" />}>{fmt(results.marginPct)}%</Row>
        <Row label="Profit / unit" icon={<DollarSign className="h-4 w-4" />}>
          <MoneyValue currency={currency} amount={results.profitPerUnit} usdRate={usdRate} />
        </Row>
        <Row label="Net revenue / unit" icon={<DollarSign className="h-4 w-4" />}>
          <MoneyValue currency={currency} amount={results.netRevenuePerUnit} usdRate={usdRate} />
        </Row>
      </div>
    </div>
  )
}

export function BreakdownCard({ currency, results, usdRate }: { currency: Currency; results: Results; usdRate: number }) {
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-soft min-w-0">
      <h3 className="text-lg font-semibold">Breakdown</h3>
      <div className="mt-3 grid grid-cols-1 gap-2 text-sm">
        <Line label="Supplier (total)">
          <MoneyValue currency={currency} amount={results.supplier} usdRate={usdRate} align="start" />
        </Line>
        <Line label="Production overhead (total)">
          <MoneyValue currency={currency} amount={results.prodOverhead} usdRate={usdRate} align="start" />
        </Line>
        <Line label="Extras (total)">
          <MoneyValue currency={currency} amount={results.extrasTotal} usdRate={usdRate} align="start" />
        </Line>
        <Line label="WHT (2%)" variant="warning">
          <MoneyValue currency={currency} amount={results.withholdingTax} usdRate={usdRate} align="start" />
        </Line>
      </div>
    </div>
  )
}

export function MobileSummaryBar({ currency, results, usdRate }: { currency: Currency; results: Results; usdRate: number }) {
  return (
    <div className="fixed bottom-2 left-2 right-2 z-20 rounded-2xl border bg-white/95 p-3 shadow-soft [padding-bottom:calc(theme(spacing.3)+env(safe-area-inset-bottom))] backdrop-blur md:hidden">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Pill label="Revenue">
          <MoneyValue currency={currency} amount={results.revenue} usdRate={usdRate} align="start" />
        </Pill>
        <Pill label="Profit">
          <MoneyValue currency={currency} amount={results.grossProfit} usdRate={usdRate} align="start" />
        </Pill>
        <Pill label="Margin">{`${fmt(results.marginPct)}%`}</Pill>
      </div>
    </div>
  )
}

function Pill({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-slate-50 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="flex min-h-[1.5rem] flex-col items-start gap-0.5 text-sm font-semibold leading-tight text-slate-700">
        {children}
      </div>
    </div>
  )
}

function Row({
  label,
  highlight,
  children,
  icon,
  variant,
}: {
  label: string
  highlight?: boolean
  children: React.ReactNode
  icon?: React.ReactNode
  variant?: 'default' | 'positive' | 'warning'
}) {
  const tone: 'default' | 'positive' | 'warning' = variant ?? (highlight ? 'positive' : 'default')
  const toneClasses =
    tone === 'positive'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : tone === 'warning'
        ? 'border-amber-200 bg-amber-50 text-amber-900'
        : 'border-slate-200 bg-white'
  return (
    <div className={clsx('flex items-center justify-between gap-2 rounded-lg border px-4 py-3', toneClasses)}>
      <div className={clsx('flex items-center gap-2', tone === 'warning' ? 'text-amber-700' : 'text-slate-600')}>
        {icon}{label}
      </div>
      <span className={clsx('min-w-0 text-right', tone === 'warning' && 'text-amber-800 font-semibold')}>{children}</span>
    </div>
  )
}

function Line({ label, children, variant }: { label: string; children: React.ReactNode; variant?: 'default' | 'warning' }) {
  const isWarning = variant === 'warning'
  return (
    <div className={clsx('flex items-center justify-between border-b py-2', isWarning && 'border-amber-200 text-amber-800')}>
      <span className={clsx('text-slate-600', isWarning && 'text-amber-700 font-semibold')}>{label}</span>
      <span className={clsx('font-medium', isWarning && 'text-amber-800 font-semibold')}>{children}</span>
    </div>
  )
}

export function ReceiptSummary({ title, currency, results, productName, quantity, products, usdRate }: { title: string; currency: Currency; results: Results; productName?: string; quantity?: number; products?: ProductInput[]; usdRate: number }) {
  const breakdown = results.productBreakdown ?? []
  return (
    <div className="rounded-2xl border bg-white p-0 shadow-soft overflow-hidden">
      {/* Receipt header */}
      <div className="bg-slate-900 text-white px-5 py-3">
        <div className="text-xs uppercase tracking-widest opacity-80">Receipt</div>
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold">{title}</div>
          {productName && <div className="text-xs bg-white/10 rounded-full px-2 py-0.5">{productName}</div>}
        </div>
      </div>
      {/* Body */}
      <div className="px-5 py-4 font-mono text-sm">
        {typeof quantity === 'number' && quantity > 0 && (
          <div className="mb-2 flex items-center justify-between">
            <span className="text-slate-600">Quantity</span>
            <span className="font-semibold">{quantity.toLocaleString()}</span>
          </div>
        )}
        <Line2 label="Revenue" strong>
          <MoneyValue currency={currency} amount={results.revenue} usdRate={usdRate} />
        </Line2>
        <Line2 label="Net revenue (after WHT)">
          <MoneyValue currency={currency} amount={results.netRevenue} usdRate={usdRate} />
        </Line2>
        <Line2 label="WHT (2%)" variant="warning">
          <MoneyValue currency={currency} amount={results.withholdingTax} usdRate={usdRate} />
        </Line2>
        <Line2 label="Gross profit">
          <MoneyValue currency={currency} amount={results.grossProfit} usdRate={usdRate} />
        </Line2>
        <Line2 label="Margin" value={`${fmt(results.marginPct)}%`} />
        <div className="my-2 border-t border-dashed" />
        <Line2 label="Profit / unit">
          <MoneyValue currency={currency} amount={results.profitPerUnit} usdRate={usdRate} />
        </Line2>
        <Line2 label="Net revenue / unit">
          <MoneyValue currency={currency} amount={results.netRevenuePerUnit} usdRate={usdRate} />
        </Line2>
        {breakdown.length > 0 && (
          <div className="mt-3 space-y-2">
            <div className="text-xs uppercase tracking-widest text-slate-500">Products</div>
            {breakdown.map((item) => {
              const fallbackName = products?.find((p) => p.id === item.productId)?.name || item.name
              return (
                <div key={item.productId} className="flex items-center justify-between gap-3 text-xs">
                  <div className="text-slate-600">
                    {fallbackName} <span className="text-[11px] text-slate-400">× {item.quantity.toLocaleString()}</span>
                  </div>
                  <MoneyValue currency={currency} amount={item.revenue} usdRate={usdRate} primaryClassName="font-medium text-slate-800" secondaryClassName="text-[10px] text-slate-500" />
                </div>
              )
            })}
          </div>
        )}
      </div>
      {/* Footer strip */}
      <div className="bg-slate-50 px-5 py-2 text-[11px] text-slate-500 flex items-center justify-between">
        <span>Thank you for using Marketing Calc</span>
        <span>{new Date().toLocaleDateString()}</span>
      </div>
    </div>
  )
}

function Line2({
  label,
  children,
  value,
  strong,
  variant,
}: {
  label: string
  children?: React.ReactNode
  value?: string
  strong?: boolean
  variant?: 'default' | 'warning'
}) {
  const isWarning = variant === 'warning'
  const labelClasses = clsx('text-slate-600', isWarning && 'text-amber-700 font-semibold')
  const valueClasses = clsx(
    strong && 'font-semibold',
    isWarning && 'text-amber-800 font-semibold',
  )
  return (
    <div className="flex items-center justify-between py-1">
      <span className={labelClasses}>{label}</span>
      {children ? (
        <span className={clsx('flex min-w-0 justify-end', valueClasses)}>{children}</span>
      ) : (
        <span className={valueClasses}>{value}</span>
      )}
    </div>
  )
}
