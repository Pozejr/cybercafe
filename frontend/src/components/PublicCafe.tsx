import React, { useState, useEffect } from 'react';
import { 
  Upload, FileText, CheckCircle, Shield, AlertTriangle, 
  CreditCard, Loader2, DollarSign, Smartphone, ShoppingBag, 
  Search, Eye, Printer, Copy, FileCode, Check, RefreshCw, Layers
} from 'lucide-react';
import ServiceSelector, { Service } from './ServiceSelector';
import UploadManager from './UploadManager';
import PhysicalServiceForm from './PhysicalServiceForm';
import PricingSummary, { BreakdownItem } from './PricingSummary';

interface PublicCafeProps {
  onOrderCreated: (orderId: string, orderNumber: string, phone: string) => void;
  apiBase: string;
}

export default function PublicCafe({ onOrderCreated, apiBase }: PublicCafeProps) {
  // Portal Navigation Tabs
  const [activeTab, setActiveTab] = useState<'order' | 'track'>('order');

  // Master Database Services
  const [services, setServices] = useState<Service[]>([]);
  const [loadingServices, setLoadingServices] = useState(true);

  // Selected Service First (Phase 2 Upgrade Core)
  const [selectedService, setSelectedService] = useState<Service | null>(null);

  // Flow State
  const [uploadAnalysis, setUploadAnalysis] = useState<any | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [pages, setPages] = useState<number>(1); // manual page count for walk-ins
  const [specialInstructions, setSpecialInstructions] = useState<string>('');

  // Extras selection (Spiral, Lamination, etc.)
  const [extras, setExtras] = useState<{ [serviceId: string]: boolean }>({});

  // Checkout & STK Status
  const [phone, setPhone] = useState<string>('');
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const [currentOrder, setCurrentOrder] = useState<any | null>(null);
  const [checkoutRequestId, setCheckoutRequestId] = useState<string | null>(null);
  const [paymentPolling, setPaymentPolling] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'paid' | 'failed' | null>(null);
  const [simulatingCallback, setSimulatingCallback] = useState(false);

  // Order Tracking Status
  const [trackPhone, setTrackPhone] = useState('');
  const [trackOrderNumber, setTrackOrderNumber] = useState('');
  const [trackingOrder, setTrackingOrder] = useState<any | null>(null);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);

  // Fetch all services from backend on mount
  const fetchServices = async () => {
    try {
      setLoadingServices(true);
      const res = await fetch(`${apiBase}/services`);
      const data = await res.json();
      if (data.success) {
        setServices(data.services);
        // Automatically default to the first printing service
        if (data.services.length > 0) {
          const defaultSvc = data.services.find((s: Service) => s.requires_upload);
          setSelectedService(defaultSvc || data.services[0]);
        }
      }
    } catch (err) {
      console.error('Error fetching database services:', err);
    } finally {
      setLoadingServices(false);
    }
  };

  useEffect(() => {
    fetchServices();
  }, []);

  // Compute live billing breakdown using ServiceFlowEngine principles
  const calculateBill = (): { breakdown: BreakdownItem[]; totalAmount: number } => {
    if (!selectedService) return { breakdown: [], totalAmount: 0 };

    const breakdown: BreakdownItem[] = [];
    let totalAmount = 0;

    const basePrice = parseFloat(selectedService.price);
    const pricingType = selectedService.pricing_type;

    // Determine how many pages to calculate
    let calculatedPages = 1;
    if (selectedService.requires_upload) {
      calculatedPages = uploadAnalysis ? uploadAnalysis.totalPages : 1;
    } else if (selectedService.requires_physical_input && pricingType === 'per_page') {
      calculatedPages = pages;
    }

    // 1. Calculate Main Selected Service
    if (pricingType === 'per_page') {
      const lineTotal = basePrice * calculatedPages * quantity;
      breakdown.push({
        description: `${selectedService.name} (${calculatedPages} pgs × ${quantity} qty)`,
        unitPrice: basePrice,
        quantity: calculatedPages * quantity,
        total: lineTotal,
      });
      totalAmount += lineTotal;
    } else if (pricingType === 'per_item') {
      const lineTotal = basePrice * quantity;
      breakdown.push({
        description: `${selectedService.name} (× ${quantity} qty)`,
        unitPrice: basePrice,
        quantity,
        total: lineTotal,
      });
      totalAmount += lineTotal;
    } else {
      // Fixed pricing type
      const lineTotal = basePrice;
      breakdown.push({
        description: `${selectedService.name} (Flat rate)`,
        unitPrice: basePrice,
        quantity: 1,
        total: lineTotal,
      });
      totalAmount += lineTotal;
    }

    // 2. Add Selected Optional Extras (Lamination, spiral binding)
    Object.keys(extras).forEach(extraId => {
      if (extras[extraId]) {
        const extraSvc = services.find(s => s.id === extraId);
        if (extraSvc) {
          const price = parseFloat(extraSvc.price);
          const lineTotal = price * quantity; // applied per batch/quantity
          breakdown.push({
            description: `${extraSvc.name} extra (× ${quantity})`,
            unitPrice: price,
            quantity,
            total: lineTotal,
          });
          totalAmount += lineTotal;
        }
      }
    });

    return {
      breakdown,
      totalAmount: parseFloat(totalAmount.toFixed(2)),
    };
  };

  const { breakdown, totalAmount } = calculateBill();

  // Reset flows when a new service is selected
  const handleServiceSelect = (service: Service) => {
    setSelectedService(service);
    setUploadAnalysis(null);
    setQuantity(1);
    setPages(1);
    setExtras({});
    setCheckoutError(null);
  };

  // Callback when UploadManager scans & verifies uploads
  const handleUploadSuccess = (analysis: any) => {
    setUploadAnalysis(analysis);
  };

  // Checkout Submit
  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedService) return;

    if (!phone) {
      setCheckoutError('Please enter your M-Pesa phone number.');
      return;
    }

    setCheckingOut(true);
    setCheckoutError(null);

    // Build order items list payload
    const itemsPayload: Array<{ serviceId: string; quantity: number; pages?: number }> = [];

    // Main service item
    let calculatedPages = 1;
    if (selectedService.requires_upload) {
      calculatedPages = uploadAnalysis ? uploadAnalysis.totalPages : 1;
    } else if (selectedService.requires_physical_input && selectedService.pricing_type === 'per_page') {
      calculatedPages = pages;
    }

    itemsPayload.push({
      serviceId: selectedService.id,
      quantity,
      pages: calculatedPages,
    });

    // Extras items
    Object.keys(extras).forEach(extraId => {
      if (extras[extraId]) {
        itemsPayload.push({
          serviceId: extraId,
          quantity,
        });
      }
    });

    // Map documents payload if uploaded
    const docsPayload = uploadAnalysis?.files.map((f: any) => ({
      filePath: f.filePath,
      pages: f.pages,
      colorPages: f.colorPages,
      bwPages: f.bwPages,
      fileType: f.mimetype,
      pageSize: f.pageSize,
    }));

    const bodyPayload = {
      phone: phone.trim(),
      items: itemsPayload,
      documents: docsPayload,
      specialInstructions: specialInstructions.trim() || undefined,
    };

    try {
      // 1. Submit order details to Express API
      const orderRes = await fetch(`${apiBase}/order/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      });

      const orderData = await orderRes.json();
      if (!orderData.success) {
        throw new Error(orderData.error || 'Failed to generate order.');
      }

      const createdOrder = orderData.order;
      setCurrentOrder(createdOrder);

      // 2. Trigger M-Pesa STK Push
      const paymentRes = await fetch(`${apiBase}/payment/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: createdOrder.id,
          phone: phone.trim(),
        }),
      });

      const paymentData = await paymentRes.json();
      if (paymentData.success) {
        setCheckoutRequestId(paymentData.checkoutRequestId);
        setPaymentStatus('pending');
        setPaymentPolling(true);
      } else {
        setCheckoutError(`Order created but M-Pesa trigger failed: ${paymentData.error}`);
      }
    } catch (err) {
      setCheckoutError((err as Error).message || 'An error occurred during order routing.');
    } finally {
      setCheckingOut(false);
    }
  };

  // Poll payment state in background
  useEffect(() => {
    let intervalId: any;

    if (paymentPolling && currentOrder) {
      const pollPayment = async () => {
        try {
          const res = await fetch(`${apiBase}/order/status?phone=${currentOrder.phone}&orderNumber=${currentOrder.orderNumber}`);
          const data = await res.json();
          if (data.success) {
            const status = data.order.paymentStatus;
            if (status === 'paid') {
              setPaymentStatus('paid');
              setPaymentPolling(false);
              onOrderCreated(currentOrder.id, currentOrder.orderNumber, currentOrder.phone);
            } else if (status === 'failed') {
              setPaymentStatus('failed');
              setPaymentPolling(false);
            }
          }
        } catch (e) {
          console.error('Polling status error:', e);
        }
      };

      intervalId = setInterval(pollPayment, 3000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [paymentPolling, currentOrder]);

  // Simulate payment callback webhook
  const triggerSimulationCallback = async (success: boolean) => {
    if (!checkoutRequestId) return;
    setSimulatingCallback(true);

    try {
      const endpoint = success ? 'simulate-success' : 'simulate-failure';
      const res = await fetch(`${apiBase}/payment/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkoutRequestId,
          reason: success ? undefined : 'Simulated Cancel by Customer',
        }),
      });
      await res.json();
    } catch (err) {
      console.error('Simulation error:', err);
    } finally {
      setSimulatingCallback(false);
    }
  };

  // Track Orders Status Lookups
  const handleTrackOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackPhone || !trackOrderNumber) {
      setTrackingError('Provide both phone and order number.');
      return;
    }

    setTrackingLoading(true);
    setTrackingError(null);
    setTrackingOrder(null);

    try {
      const res = await fetch(`${apiBase}/order/status?phone=${trackPhone.trim()}&orderNumber=${trackOrderNumber.trim()}`);
      const data = await res.json();
      if (data.success) {
        setTrackingOrder(data.order);
      } else {
        setTrackingError(data.error || 'Order matches not found.');
      }
    } catch (err) {
      setTrackingError('Network error while searching.');
    } finally {
      setTrackingLoading(false);
    }
  };

  // Render correct visual timeline statuses
  const getStatusClass = (orderStatus: string) => {
    const maps: { [key: string]: string } = {
      pending: 'bg-amber-100 text-amber-800 border-amber-200',
      paid: 'bg-blue-100 text-blue-800 border-blue-200',
      processing: 'bg-purple-100 text-purple-800 border-purple-200',
      ready: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      completed: 'bg-slate-100 text-slate-800 border-slate-200',
    };
    return maps[orderStatus] || 'bg-slate-100 text-slate-800';
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Banner */}
      <div className="bg-gradient-to-r from-green-600 to-emerald-700 rounded-3xl p-8 text-white shadow-xl mb-8 relative overflow-hidden">
        <div className="absolute right-0 bottom-0 top-0 opacity-10 pointer-events-none">
          <Printer size={300} strokeWidth={1} />
        </div>
        <div className="relative z-10 max-w-xl">
          <span className="bg-green-500/30 text-emerald-200 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider">
            Intelligent Workflow System (Phase 2)
          </span>
          <h1 className="text-3xl md:text-4xl font-extrabold mt-3 tracking-tight">Mega Cyber Café</h1>
          <p className="mt-2 text-emerald-100 text-xs md:text-sm">
            Service-first automation dashboard. Choose a service first — the system will instantly guide you through uploading, quantity configuring, or assistance filling!
          </p>
          
          <div className="flex flex-wrap gap-4 mt-6 text-[10px] text-emerald-200 border-t border-white/10 pt-4 font-bold uppercase tracking-wider">
            <span className="flex items-center gap-1">
              <Shield size={12} /> Multi-File Scanner Active
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle size={12} /> Walk-in options added
            </span>
            <span className="flex items-center gap-1">
              <Smartphone size={12} /> Dynamic Price Engine
            </span>
          </div>
        </div>
      </div>

      {/* Main Tabs Selection */}
      <div className="flex bg-slate-200/60 p-1.5 rounded-xl mb-8 max-w-md mx-auto">
        <button
          onClick={() => setActiveTab('order')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg font-bold text-xs transition-all duration-200 ${
            activeTab === 'order' 
              ? 'bg-white text-slate-900 shadow-sm' 
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <Layers size={14} /> Guided Services
        </button>
        <button
          onClick={() => setActiveTab('track')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg font-bold text-xs transition-all duration-200 ${
            activeTab === 'track' 
              ? 'bg-white text-slate-900 shadow-sm' 
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <Search size={14} /> Track Orders
        </button>
      </div>

      {/* DYNAMIC FLOW CONTAINER */}
      {activeTab === 'order' && (
        <div className="space-y-8">
          
          {/* Step 1: Service Selection Grid */}
          <ServiceSelector 
            services={services} 
            selectedService={selectedService} 
            onSelectService={handleServiceSelect} 
          />

          {/* Steps 2-5: Dynamic Flow Breakdown depending on decision engine */}
          {selectedService && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pt-4 border-t border-slate-200/60">
              
              {/* Dynamic Step 2 Configuration (Left Area) */}
              <div className="lg:col-span-2 space-y-6">
                
                {/* 1. DOCUMENT FLOW UI (Upload Area) */}
                {selectedService.requires_upload && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-xs">2</div>
                      <h4 className="font-extrabold text-slate-800 text-sm">Step 2: Document Upload & Analysis</h4>
                    </div>
                    <UploadManager 
                      apiBase={apiBase} 
                      onUploadSuccess={handleUploadSuccess} 
                      onClear={() => setUploadAnalysis(null)} 
                    />
                  </div>
                )}

                {/* 2. PHYSICAL WALK-IN FLOW UI */}
                {selectedService.requires_physical_input && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center font-bold text-xs">2</div>
                      <h4 className="font-extrabold text-slate-800 text-sm">Step 2: Configure Physical Settings</h4>
                    </div>
                    <PhysicalServiceForm 
                      serviceName={selectedService.name}
                      pricingType={selectedService.pricing_type}
                      quantity={quantity}
                      setQuantity={setQuantity}
                      pages={pages}
                      setPages={setPages}
                      specialInstructions={specialInstructions}
                      setSpecialInstructions={setSpecialInstructions}
                    />
                  </div>
                )}

                {/* 3. DIGITAL/ONLINE ASSISTANCE FLOW FORM */}
                {!selectedService.requires_upload && !selectedService.requires_physical_input && (
                  <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 shadow-sm">
                    <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                      <div className="w-6 h-6 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center font-bold text-xs">2</div>
                      <h4 className="font-extrabold text-slate-800 text-sm">Step 2: Digital Form Input</h4>
                    </div>

                    <div className="p-3 bg-sky-50 rounded-xl border border-sky-100 text-[11px] text-sky-800 font-semibold">
                      Selected Service: <span className="font-extrabold">{selectedService.name}</span>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Your Full Name (For Application Documents)</label>
                        <input 
                          type="text"
                          placeholder="e.g., John Kamau"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-sky-500 font-semibold"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Details / Special Guidelines</label>
                        <textarea
                          value={specialInstructions}
                          onChange={(e) => setSpecialInstructions(e.target.value)}
                          placeholder="Please provide any key information needed (e.g., KRA login credentials, job application URLs, CV work experience details, etc.)"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs focus:outline-none focus:border-sky-500 font-medium h-24 resize-none"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Extras Selection Checklist (Shared UI section in the center area) */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 shadow-sm">
                  <h4 className="font-extrabold text-slate-800 text-sm border-b border-slate-100 pb-2">Optional Add-ons (Select to attach)</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {services
                      .filter(s => s.name.toLowerCase().includes('spiral') || s.name.toLowerCase().includes('lamination') || s.name.toLowerCase().includes('binding'))
                      .map(extra => (
                        <label 
                          key={extra.id}
                          className={`border rounded-xl p-3 flex items-center gap-3 cursor-pointer select-none transition-all duration-150 ${
                            extras[extra.id] 
                              ? 'border-green-500 bg-green-50/50 font-bold' 
                              : 'border-slate-100 hover:bg-slate-50 text-slate-600'
                          }`}
                        >
                          <input 
                            type="checkbox"
                            checked={!!extras[extra.id]}
                            onChange={() => setExtras({ ...extras, [extra.id]: !extras[extra.id] })}
                            className="w-4 h-4 text-green-600 border-slate-300 rounded focus:ring-green-500"
                          />
                          <div className="flex-1 min-w-0">
                            <span className="block text-[11px] truncate">{extra.name}</span>
                            <span className="block text-[10px] font-bold text-green-600 mt-0.5">+{parseFloat(extra.price)} KES</span>
                          </div>
                        </label>
                      ))}
                  </div>
                </div>

              </div>

              {/* Live Billing & M-Pesa STK trigger (Right Area) */}
              <div>
                <PricingSummary 
                  breakdown={breakdown} 
                  totalAmount={totalAmount} 
                  phone={phone} 
                  setPhone={setPhone} 
                  onSubmit={handleCheckout} 
                  loading={checkingOut} 
                  error={checkoutError} 
                />
              </div>

            </div>
          )}

        </div>
      )}

      {/* SEARCH/TRACK TIMELINE VIEW */}
      {activeTab === 'track' && (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-6 max-w-2xl mx-auto">
          <h3 className="font-extrabold text-slate-800 text-lg mb-2 text-center">Track Your Cyber Café Order</h3>
          <p className="text-slate-400 text-[10px] text-center mb-6 max-w-sm mx-auto">
            Input your Safaricom phone and the unique order invoice number (e.g. CC-123456) to look up live compilation status.
          </p>

          <form onSubmit={handleTrackOrder} className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">Safaricom Phone</label>
              <input 
                type="tel" 
                required
                placeholder="0712345678"
                value={trackPhone}
                onChange={(e) => setTrackPhone(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-green-500 font-bold"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">Order Number</label>
              <input 
                type="text" 
                required
                placeholder="CC-XXXXXX"
                value={trackOrderNumber}
                onChange={(e) => setTrackOrderNumber(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-green-500 font-bold uppercase"
              />
            </div>
            <div className="sm:col-span-2">
              <button 
                type="submit"
                disabled={trackingLoading}
                className="w-full bg-slate-950 hover:bg-slate-900 text-white font-bold text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5"
              >
                {trackingLoading ? <Loader2 className="animate-spin" size={14} /> : "Search Invoice"}
              </button>
            </div>
          </form>

          {trackingError && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600 text-center mb-6">
              {trackingError}
            </div>
          )}

          {trackingOrder && (
            <div className="border border-slate-100 rounded-2xl p-5 bg-slate-50/50 space-y-5 text-xs">
              
              <div className="flex justify-between items-center border-b border-slate-150 pb-3">
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase">Order Invoice</span>
                  <p className="text-base font-extrabold text-slate-900">{trackingOrder.orderNumber}</p>
                </div>
                <div className="text-right">
                  <span className="text-[9px] font-bold text-slate-400 uppercase block">Grand Total</span>
                  <span className="text-lg font-extrabold text-green-600 block">{parseFloat(trackingOrder.totalAmount)} KES</span>
                </div>
              </div>

              {/* Phase 2: Page breakdown rendering details */}
              {trackingOrder.documentAnalysis && (
                <div className="bg-white rounded-xl p-3.5 border border-slate-100 space-y-1.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Document Analysis Results</span>
                  <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                    <div className="p-1.5 bg-slate-50 border border-slate-100 rounded">
                      <span className="text-[9px] text-slate-400 block">Total Pages</span>
                      <span className="font-extrabold text-slate-800">{trackingOrder.documentAnalysis.totalPages}</span>
                    </div>
                    <div className="p-1.5 bg-slate-50 border border-slate-100 rounded">
                      <span className="text-[9px] text-slate-400 block">B&W Pages</span>
                      <span className="font-extrabold text-slate-800">{trackingOrder.documentAnalysis.bwPages}</span>
                    </div>
                    <div className="p-1.5 bg-slate-50 border border-slate-100 rounded">
                      <span className="text-[9px] text-slate-400 block">Color Pages</span>
                      <span className="font-extrabold text-slate-800">{trackingOrder.documentAnalysis.colorPages}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Special instructions */}
              {trackingOrder.specialInstructions && (
                <div className="bg-amber-50/50 rounded-xl p-3 border border-amber-100/40">
                  <span className="text-[10px] font-bold text-amber-600 block uppercase">Special Guidelines</span>
                  <p className="text-[11px] text-slate-600 mt-1 font-medium">{trackingOrder.specialInstructions}</p>
                </div>
              )}

              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase mb-3 block">Live Work Progress</span>
                
                <div className="relative">
                  <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-slate-200" />

                  <div className="flex gap-4 items-start relative pb-6">
                    <div className="z-10 w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center font-bold text-xs">✓</div>
                    <div>
                      <h4 className="font-bold text-xs text-slate-800">Order Placed</h4>
                      <p className="text-[10px] text-slate-400">Order successfully logged inside the cafe service manager.</p>
                    </div>
                  </div>

                  <div className="flex gap-4 items-start relative pb-6">
                    <div className={`z-10 w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                      trackingOrder.paymentStatus === 'paid' ? 'bg-green-500 text-white' : 'bg-slate-200 text-slate-400'
                    }`}>{trackingOrder.paymentStatus === 'paid' ? '✓' : '2'}</div>
                    <div>
                      <h4 className={`font-bold text-xs ${trackingOrder.paymentStatus === 'paid' ? 'text-slate-800' : 'text-slate-400'}`}>M-Pesa Verified</h4>
                      <p className="text-[10px] text-slate-400">{trackingOrder.paymentStatus === 'paid' ? 'Lipa Na M-Pesa verified successfully.' : 'Pending STK PIN entry.'}</p>
                    </div>
                  </div>

                  <div className="flex gap-4 items-start relative pb-6">
                    <div className={`z-10 w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                      ['processing', 'ready', 'completed'].includes(trackingOrder.orderStatus) ? 'bg-green-500 text-white' : 'bg-slate-200 text-slate-400'
                    }`}>{['processing', 'ready', 'completed'].includes(trackingOrder.orderStatus) ? '✓' : '3'}</div>
                    <div>
                      <h4 className={`font-bold text-xs ${['paid', 'processing', 'ready', 'completed'].includes(trackingOrder.orderStatus) ? 'text-slate-800' : 'text-slate-400'}`}>Assigned / Printing</h4>
                      <p className="text-[10px] text-slate-400">CUPS printer driver spooling / filling forms actively.</p>
                    </div>
                  </div>

                  <div className="flex gap-4 items-start relative pb-6">
                    <div className={`z-10 w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                      ['ready', 'completed'].includes(trackingOrder.orderStatus) ? 'bg-green-500 text-white' : 'bg-slate-200 text-slate-400'
                    }`}>{['ready', 'completed'].includes(trackingOrder.orderStatus) ? '✓' : '4'}</div>
                    <div>
                      <h4 className={`font-bold text-xs ${['ready', 'completed'].includes(trackingOrder.orderStatus) ? 'text-slate-800' : 'text-slate-400'}`}>Ready for Pickup</h4>
                      <p className="text-[10px] text-slate-400">Job finalized and verified. Ready for walk-in collection.</p>
                    </div>
                  </div>

                </div>
              </div>

            </div>
          )}

        </div>
      )}

      {/* DETAILED M-PESA MODAL SIMULATOR */}
      {paymentStatus && currentOrder && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-md w-full p-6 text-center space-y-6 relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-2 bg-green-500" />
            
            <Smartphone size={40} className="mx-auto text-green-500 animate-bounce" />

            <div>
              <h3 className="font-extrabold text-slate-900 text-lg">M-Pesa STK Push Initiated</h3>
              <p className="text-slate-500 text-[10px] mt-1">
                Enter your M-Pesa PIN on handset of <span className="font-bold text-slate-800">{currentOrder.phone}</span>.
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2 text-xs text-left">
              <div className="flex justify-between font-bold">
                <span className="text-slate-500">Invoice</span>
                <span className="text-slate-800">{currentOrder.orderNumber}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span className="text-slate-500">STK push total</span>
                <span className="text-green-600 font-extrabold">{parseFloat(currentOrder.totalAmount)} KES</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-center gap-2 text-xs text-amber-600 font-bold bg-amber-50 border border-amber-100 p-3 rounded-xl animate-pulse">
                <Loader2 className="animate-spin" size={12} /> Polling Safaricom callback servers...
              </div>

              {/* Simulated callback action keys */}
              <div className="bg-slate-900 text-slate-100 p-4 rounded-2xl space-y-2 text-left mt-4 border border-slate-800">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-1.5">
                  <span>M-Pesa Sandbox Simulator</span>
                  <span className="text-green-500">ONLINE</span>
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  Trigger mock transaction callbacks to advance the order directly into the attendant's print queue.
                </p>
                <div className="grid grid-cols-2 gap-2 pt-1.5">
                  <button
                    type="button"
                    disabled={simulatingCallback}
                    onClick={() => triggerSimulationCallback(true)}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold py-2 px-2.5 rounded-lg text-xs flex items-center justify-center gap-1 shadow-sm transition-colors"
                  >
                    {simulatingCallback ? <Loader2 className="animate-spin" size={10} /> : "Simulate Success"}
                  </button>
                  <button
                    type="button"
                    disabled={simulatingCallback}
                    onClick={() => triggerSimulationCallback(false)}
                    className="bg-red-600 hover:bg-red-500 text-white font-extrabold py-2 px-2.5 rounded-lg text-xs flex items-center justify-center gap-1 shadow-sm transition-colors"
                  >
                    Simulate Cancel
                  </button>
                </div>
              </div>
            </div>

            {paymentStatus === 'paid' && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex flex-col items-center gap-1">
                <CheckCircle size={18} /> Webhook callback success!
                <span className="font-normal text-[10px] text-emerald-600">The order has been forwarded to the print spoolers.</span>
              </div>
            )}

            <div className="pt-2">
              <button
                onClick={() => {
                  setPaymentStatus(null);
                  setCurrentOrder(null);
                  setCheckoutRequestId(null);
                  setPaymentPolling(false);
                }}
                className="text-[11px] font-bold text-slate-500 hover:text-slate-800 underline"
              >
                Close and Track Status Manually
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
