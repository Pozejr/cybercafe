import React from 'react';
import { FileText, Smartphone, Settings, Layers, UserCheck, HelpCircle } from 'lucide-react';

export interface Service {
  id: string;
  name: string;
  price: string;
  requires_upload: boolean;
  requires_physical_input: boolean;
  pricing_type: 'per_page' | 'fixed' | 'per_item';
  category_id?: string;
}

export interface Category {
  id: string;
  name: string;
  description: string;
}

interface ServiceSelectorProps {
  services: Service[];
  selectedService: Service | null;
  onSelectService: (service: Service) => void;
}

export default function ServiceSelector({ services, selectedService, onSelectService }: ServiceSelectorProps) {
  // Hardcoded categorization for clean visuals based on seeded categories
  const categories = [
    {
      name: 'Document-Based Services',
      description: 'Requires upload (PDF, images, Word)',
      icon: <FileText className="text-emerald-500" size={18} />,
      colorClass: 'border-emerald-100 hover:border-emerald-300 bg-emerald-50/10'
    },
    {
      name: 'Physical Walk-in Services',
      description: 'Bring physical paper documents',
      icon: <Layers className="text-amber-500" size={18} />,
      colorClass: 'border-amber-100 hover:border-amber-300 bg-amber-50/10'
    },
    {
      name: 'Digital & Cyber Assistance',
      description: 'Online forms, accounts & CV editing',
      icon: <UserCheck className="text-sky-500" size={18} />,
      colorClass: 'border-sky-100 hover:border-sky-300 bg-sky-50/10'
    }
  ];

  const getServiceCategory = (service: Service): string => {
    if (service.requires_upload) {
      return 'Document-Based Services';
    } else if (service.requires_physical_input) {
      return 'Physical Walk-in Services';
    } else {
      return 'Digital & Cyber Assistance';
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-extrabold text-slate-800 tracking-tight">Step 1 — Choose a Service</h3>
        <p className="text-xs text-slate-500">Select any cyber café service below to start your intelligent automated flow</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {categories.map((cat, idx) => {
          // Filter services matching this category
          const filteredServices = services.filter(s => getServiceCategory(s) === cat.name);

          return (
            <div key={idx} className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-sm flex flex-col justify-between">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  {cat.icon}
                  <h4 className="font-extrabold text-slate-900 text-sm tracking-tight">{cat.name}</h4>
                </div>
                <p className="text-[11px] text-slate-400">{cat.description}</p>
              </div>

              <div className="space-y-2 flex-1 pt-3">
                {filteredServices.length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic text-center py-4">Loading services...</p>
                ) : (
                  filteredServices.map(service => {
                    const isSelected = selectedService?.id === service.id;
                    return (
                      <button
                        key={service.id}
                        type="button"
                        onClick={() => onSelectService(service)}
                        className={`w-full text-left p-3 rounded-xl border text-xs transition-all duration-150 flex justify-between items-center ${
                          isSelected
                            ? 'bg-slate-900 text-white border-slate-900 font-bold scale-[1.01] shadow-md shadow-slate-900/10'
                            : 'bg-slate-50 border-slate-100 hover:bg-slate-100 text-slate-700 font-semibold'
                        }`}
                      >
                        <span className="truncate pr-2">{service.name}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          isSelected ? 'bg-green-500 text-slate-950' : 'bg-slate-200 text-slate-700'
                        }`}>
                          {parseFloat(service.price)} KES
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
