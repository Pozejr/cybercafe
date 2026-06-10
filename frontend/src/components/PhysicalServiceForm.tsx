import React from 'react';
import { Layers, FilePlus, Copy, Compass } from 'lucide-react';

interface PhysicalServiceFormProps {
  serviceName: string;
  pricingType: 'per_page' | 'fixed' | 'per_item';
  quantity: number;
  setQuantity: (q: number) => void;
  pages: number;
  setPages: (p: number) => void;
  specialInstructions: string;
  setSpecialInstructions: (notes: string) => void;
}

export default function PhysicalServiceForm({
  serviceName,
  pricingType,
  quantity,
  setQuantity,
  pages,
  setPages,
  specialInstructions,
  setSpecialInstructions,
}: PhysicalServiceFormProps) {
  const isPageBased = pricingType === 'per_page';

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-5">
      <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
        <Layers className="text-amber-500" size={18} />
        <div>
          <h4 className="font-extrabold text-slate-800 text-sm">Configure Walk-in Settings</h4>
          <p className="text-[10px] text-slate-400">Configure quantity options for physical services brought to the counter</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Service Title Badge */}
        <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 text-[11px] text-amber-800 font-semibold">
          Selected Service: <span className="font-extrabold">{serviceName}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Quantity Counter */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Quantity / Copies</label>
            <div className="flex items-center gap-3">
              <button 
                type="button"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="w-9 h-9 rounded-lg border border-slate-200 font-bold flex items-center justify-center text-slate-700 bg-slate-50 hover:bg-slate-100 transition-colors"
              >
                -
              </button>
              <span className="w-8 text-center font-extrabold text-sm text-slate-800">{quantity}</span>
              <button 
                type="button"
                onClick={() => setQuantity(quantity + 1)}
                className="w-9 h-9 rounded-lg border border-slate-200 font-bold flex items-center justify-center text-slate-700 bg-slate-50 hover:bg-slate-100 transition-colors"
              >
                +
              </button>
            </div>
          </div>

          {/* Physical page count (If Page-Based pricing, e.g. walk-in photocopies!) */}
          {isPageBased && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Physical Sheets Count</label>
              <div className="relative rounded-xl shadow-sm">
                <input
                  type="number"
                  required
                  min="1"
                  value={pages}
                  onChange={(e) => setPages(Math.max(1, parseInt(e.target.value) || 1))}
                  className="block w-full rounded-xl border border-slate-200 py-1.5 px-3 text-xs focus:outline-none focus:border-amber-500 font-bold"
                />
              </div>
            </div>
          )}
        </div>

        {/* Special Instructions */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Attendant Instructions</label>
          <textarea
            value={specialInstructions}
            onChange={(e) => setSpecialInstructions(e.target.value)}
            placeholder="e.g., Use double sided printing, staple top-left corner, binding with blue covers, etc."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs focus:outline-none focus:border-amber-500 font-medium h-20 resize-none"
          />
        </div>
      </div>
    </div>
  );
}
