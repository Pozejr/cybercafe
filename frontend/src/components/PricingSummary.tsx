import React from 'react';
import { ShoppingBag, Smartphone, CreditCard, Loader2 } from 'lucide-react';

export interface BreakdownItem {
  description: string;
  unitPrice: number;
  quantity: number;
  total: number;
}

interface PricingSummaryProps {
  breakdown: BreakdownItem[];
  totalAmount: number;
  phone: string;
  setPhone: (p: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  loading: boolean;
  error: string | null;
}

export default function PricingSummary({
  breakdown,
  totalAmount,
  phone,
  setPhone,
  onSubmit,
  loading,
  error,
}: PricingSummaryProps) {
  return (
    <div className="bg-white rounded-2xl border-2 border-slate-900 shadow-xl p-6 relative overflow-hidden">
      <h3 className="font-extrabold text-slate-900 text-sm mb-4 flex items-center gap-2 border-b border-slate-100 pb-3">
        <ShoppingBag size={18} className="text-slate-800" /> Live Bill Invoice
      </h3>

      {/* Breakdown lines */}
      <div className="space-y-3.5 mb-5 max-h-56 overflow-y-auto pr-1">
        {breakdown.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-4 font-semibold">Configuring your service price...</p>
        ) : (
          breakdown.map((item, idx) => (
            <div key={idx} className="flex justify-between items-start text-[11px] text-slate-600 border-b border-dashed border-slate-100 pb-2.5">
              <div className="pr-2">
                <span className="font-bold text-slate-800 block">{item.description}</span>
                <span className="text-[10px] text-slate-400 font-medium">{item.unitPrice} KES per unit</span>
              </div>
              <span className="font-extrabold text-slate-800 text-right">{item.total} KES</span>
            </div>
          ))
        )}
      </div>

      {/* Bill total */}
      <div className="flex justify-between items-center bg-slate-50 border border-slate-100 rounded-xl p-4 mb-5">
        <span className="font-bold text-slate-600 text-[10px] uppercase tracking-wider">Estimated Cost</span>
        <span className="font-extrabold text-xl text-green-600">{totalAmount} KES</span>
      </div>

      {/* Checkout Submit Form */}
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">M-Pesa Number</label>
          <div className="relative rounded-xl shadow-sm">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <Smartphone className="h-3.5 w-3.5 text-slate-400" />
            </div>
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g., 0712345678"
              className="block w-full rounded-xl border border-slate-200 pl-9 py-2 text-xs focus:outline-none focus:border-green-500 font-semibold"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={totalAmount <= 0 || loading}
          className={`w-full py-3 px-4 rounded-xl font-bold text-xs tracking-wider text-white transition-all flex items-center justify-center gap-2 shadow-md ${
            totalAmount <= 0 
              ? 'bg-slate-300 cursor-not-allowed shadow-none' 
              : 'bg-green-600 hover:bg-green-700 shadow-green-600/10'
          }`}
        >
          {loading ? (
            <>
              <Loader2 className="animate-spin" size={14} /> Placing Order...
            </>
          ) : (
            <>
              <CreditCard size={14} /> Pay {totalAmount} KES via STK Push
            </>
          )}
        </button>
      </form>

      {error && (
        <div className="mt-3 p-3 bg-red-50 border border-red-100 rounded-lg text-[10px] text-red-600 text-center font-semibold">
          {error}
        </div>
      )}
    </div>
  );
}
