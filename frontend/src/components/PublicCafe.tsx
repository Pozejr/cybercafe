import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, FileText, CheckCircle, Shield, AlertTriangle, 
  CreditCard, Loader2, DollarSign, Smartphone, ShoppingBag, 
  Search, Eye, Printer, Copy, FileCode, Check, RefreshCw
} from 'lucide-react';

interface Service {
  id: string;
  name: string;
  price: string;
}

interface UploadedFile {
  originalName: string;
  filePath: string;
  size: number;
  mimetype: string;
  pages: number;
  colorPages: number;
  bwPages: number;
  isSafe: boolean;
}

interface PublicCafeProps {
  onOrderCreated: (orderId: string, orderNumber: string, phone: string) => void;
  apiBase: string;
}

export default function PublicCafe({ onOrderCreated, apiBase }: PublicCafeProps) {
  // Navigation / Tabs inside Public Cafe
  const [activeTab, setActiveTab] = useState<'order' | 'track'>('order');

  // Database Services
  const [services, setServices] = useState<Service[]>([]);
  const [loadingServices, setLoadingServices] = useState(true);

  // Document Upload State
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [securityLogs, setSecurityLogs] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Configuration State
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [copies, setCopies] = useState<number>(1);
  const [extras, setExtras] = useState<{ [serviceId: string]: boolean }>({});
  
  // Custom overriding for PDF printing (customer can manually adjust if heuristic is off)
  const [isCustomPrintConfig, setIsCustomPrintConfig] = useState(false);
  const [customBwPages, setCustomBwPages] = useState(0);
  const [customColorPages, setCustomColorPages] = useState(0);

  // Checkout State
  const [phone, setPhone] = useState<string>('');
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Payment State (STK Push simulation)
  const [currentOrder, setCurrentOrder] = useState<any | null>(null);
  const [checkoutRequestId, setCheckoutRequestId] = useState<string | null>(null);
  const [paymentPolling, setPaymentPolling] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'paid' | 'failed' | null>(null);
  const [simulatingCallback, setSimulatingCallback] = useState(false);

  // Order Tracking Form State
  const [trackPhone, setTrackPhone] = useState('');
  const [trackOrderNumber, setTrackOrderNumber] = useState('');
  const [trackingOrder, setTrackingOrder] = useState<any | null>(null);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);

  // Fetch services from DB
  const fetchServices = async () => {
    try {
      setLoadingServices(true);
      const res = await fetch(`${apiBase}/services`);
      const data = await res.json();
      if (data.success) {
        setServices(data.services);
        // Set default printing service (e.g., B/W page printing)
        const defaultSvc = data.services.find((s: Service) => s.name.toLowerCase().includes('b&w') || s.name.toLowerCase().includes('black'));
        if (defaultSvc) {
          setSelectedServiceId(defaultSvc.id);
        } else if (data.services.length > 0) {
          setSelectedServiceId(data.services[0].id);
        }
      }
    } catch (err) {
      console.error('Error fetching services:', err);
    } finally {
      setLoadingServices(false);
    }
  };

  useEffect(() => {
    fetchServices();
  }, []);

  // Sync custom pages with uploaded file metadata
  useEffect(() => {
    if (file) {
      setCustomBwPages(file.bwPages);
      setCustomColorPages(file.colorPages);
    }
  }, [file]);

  // Handle Drag & Drop / Selection File Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setUploading(true);
    setUploadError(null);
    setFile(null);
    setSecurityLogs('');

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await fetch(`${apiBase}/upload`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (data.success) {
        setFile(data.file);
        setSecurityLogs('SECURE: File scanned safe. Magic bytes verified. Heuristics completed.');
      } else {
        setUploadError(data.error || 'Security or formatting issue during upload.');
        if (data.details) {
          setSecurityLogs(data.details);
        }
      }
    } catch (err) {
      setUploadError('Network error while uploading file. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  // Pricing Engine calculations
  const calculatePricingBreakdown = () => {
    let breakdown: Array<{ description: string; unitPrice: number; quantity: number; total: number }> = [];
    let grandTotal = 0;

    // 1. Calculate document-specific pages (if uploaded)
    if (file) {
      const bwPagesCount = isCustomPrintConfig ? customBwPages : file.bwPages;
      const colorPagesCount = isCustomPrintConfig ? customColorPages : file.colorPages;

      // Find database services for BW and Color printing
      const bwService = services.find(s => s.name.toLowerCase().includes('b&w') || s.name.toLowerCase().includes('black'));
      const colorService = services.find(s => s.name.toLowerCase().includes('color'));

      if (bwPagesCount > 0 && bwService) {
        const price = parseFloat(bwService.price);
        const total = price * bwPagesCount * copies;
        breakdown.push({
          description: `B&W Pages (${bwPagesCount} pgs × ${copies} copies)`,
          unitPrice: price,
          quantity: bwPagesCount * copies,
          total
        });
        grandTotal += total;
      } else if (bwPagesCount > 0) {
        // Fallback pricing if DB service not found
        const price = 5;
        const total = price * bwPagesCount * copies;
        breakdown.push({
          description: `B&W Pages (Fallback) (${bwPagesCount} pgs × ${copies} copies)`,
          unitPrice: price,
          quantity: bwPagesCount * copies,
          total
        });
        grandTotal += total;
      }

      if (colorPagesCount > 0 && colorService) {
        const price = parseFloat(colorService.price);
        const total = price * colorPagesCount * copies;
        breakdown.push({
          description: `Color Pages (${colorPagesCount} pgs × ${copies} copies)`,
          unitPrice: price,
          quantity: colorPagesCount * copies,
          total
        });
        grandTotal += total;
      } else if (colorPagesCount > 0) {
        // Fallback pricing if DB service not found
        const price = 20;
        const total = price * colorPagesCount * copies;
        breakdown.push({
          description: `Color Pages (Fallback) (${colorPagesCount} pgs × ${copies} copies)`,
          unitPrice: price,
          quantity: colorPagesCount * copies,
          total
        });
        grandTotal += total;
      }
    } else {
      // No file uploaded, calculate using manually selected base service
      const selectedSvc = services.find(s => s.id === selectedServiceId);
      if (selectedSvc) {
        const price = parseFloat(selectedSvc.price);
        const total = price * copies;
        breakdown.push({
          description: `${selectedSvc.name} (× ${copies})`,
          unitPrice: price,
          quantity: copies,
          total
        });
        grandTotal += total;
      }
    }

    // 2. Add Extras (Spiral binding, lamination, etc.)
    Object.keys(extras).forEach(svcId => {
      if (extras[svcId]) {
        const svc = services.find(s => s.id === svcId);
        if (svc) {
          const price = parseFloat(svc.price);
          const total = price * copies; // extra applied per copy
          breakdown.push({
            description: `${svc.name} extra (× ${copies})`,
            unitPrice: price,
            quantity: copies,
            total
          });
          grandTotal += total;
        }
      }
    });

    return { breakdown, grandTotal };
  };

  const { breakdown, grandTotal } = calculatePricingBreakdown();

  // Checkout and Order Placement
  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone) {
      setCheckoutError('Please enter your M-Pesa phone number.');
      return;
    }

    setCheckingOut(true);
    setCheckoutError(null);

    // Build the request body payload
    const itemsPayload: Array<{ serviceId: string; quantity: number }> = [];

    if (file) {
      // If file exists, we automatically add the printing services
      const bwPagesCount = isCustomPrintConfig ? customBwPages : file.bwPages;
      const colorPagesCount = isCustomPrintConfig ? customColorPages : file.colorPages;

      const bwService = services.find(s => s.name.toLowerCase().includes('b&w') || s.name.toLowerCase().includes('black'));
      const colorService = services.find(s => s.name.toLowerCase().includes('color'));

      if (bwPagesCount > 0 && bwService) {
        itemsPayload.push({ serviceId: bwService.id, quantity: bwPagesCount * copies });
      }
      if (colorPagesCount > 0 && colorService) {
        itemsPayload.push({ serviceId: colorService.id, quantity: colorPagesCount * copies });
      }
    } else {
      // Custom single service item
      itemsPayload.push({ serviceId: selectedServiceId, quantity: copies });
    }

    // Add extras
    Object.keys(extras).forEach(svcId => {
      if (extras[svcId]) {
        itemsPayload.push({ serviceId: svcId, quantity: copies });
      }
    });

    const bodyPayload = {
      phone: phone.trim(),
      items: itemsPayload,
      document: file ? {
        filePath: file.filePath,
        pages: isCustomPrintConfig ? (customBwPages + customColorPages) : file.pages,
        colorPages: isCustomPrintConfig ? customColorPages : file.colorPages,
        bwPages: isCustomPrintConfig ? customBwPages : file.bwPages,
      } : undefined,
    };

    try {
      // 1. Create order in DB
      const orderRes = await fetch(`${apiBase}/order/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      });

      const orderData = await orderRes.json();
      if (!orderData.success) {
        throw new Error(orderData.error || 'Failed to place order.');
      }

      const createdOrder = orderData.order;
      setCurrentOrder(createdOrder);

      // 2. Trigger M-Pesa payment STK Push
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
      setCheckoutError((err as Error).message || 'An error occurred during checkout.');
    } finally {
      setCheckingOut(false);
    }
  };

  // Poll for payment success status in real-time
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
              // Fire parent notification
              onOrderCreated(currentOrder.id, currentOrder.orderNumber, currentOrder.phone);
            } else if (status === 'failed') {
              setPaymentStatus('failed');
              setPaymentPolling(false);
            }
          }
        } catch (e) {
          console.error('Polling payment status error:', e);
        }
      };

      intervalId = setInterval(pollPayment, 3000); // Poll every 3 seconds
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [paymentPolling, currentOrder]);

  // Simulate payment callback on the backend (for offline/developer mode)
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
          reason: success ? undefined : 'Simulated Cancel by User',
        }),
      });
      await res.json();
    } catch (err) {
      console.error('Simulation error:', err);
    } finally {
      setSimulatingCallback(false);
    }
  };

  // Customer Order Tracking Lookups
  const handleTrackOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackPhone || !trackOrderNumber) {
      setTrackingError('Please provide both phone number and order number.');
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
        setTrackingError(data.error || 'Order matching those details not found.');
      }
    } catch (err) {
      setTrackingError('Network error while searching for order status.');
    } finally {
      setTrackingLoading(false);
    }
  };

  // Status Badge Helper
  const getStatusBadgeClass = (status: string) => {
    const maps: { [key: string]: string } = {
      pending: 'bg-amber-100 text-amber-800 border-amber-200',
      paid: 'bg-blue-100 text-blue-800 border-blue-200',
      processing: 'bg-purple-100 text-purple-800 border-purple-200',
      ready: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      completed: 'bg-slate-100 text-slate-800 border-slate-200',
    };
    return maps[status] || 'bg-slate-100 text-slate-800';
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header and Service Banner */}
      <div className="bg-gradient-to-r from-green-600 to-emerald-700 rounded-3xl p-8 text-white shadow-xl mb-8 relative overflow-hidden">
        <div className="absolute right-0 bottom-0 top-0 opacity-10 pointer-events-none">
          <Printer size={300} strokeWidth={1} />
        </div>
        <div className="relative z-10 max-w-xl">
          <span className="bg-green-500/30 text-emerald-200 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider">
            Self-Service Hub (No Login)
          </span>
          <h1 className="text-3xl md:text-4xl font-extrabold mt-3 tracking-tight">Mega Cyber Café</h1>
          <p className="mt-2 text-emerald-100 text-sm md:text-base">
            Upload documents, customize your print settings, pay instantly via M-Pesa STK Push, and watch your papers print automatically!
          </p>
          
          {/* Quick Stats Banner */}
          <div className="flex flex-wrap gap-4 mt-6 text-xs text-emerald-200 border-t border-white/10 pt-4">
            <span className="flex items-center gap-1">
              <Shield size={14} /> Encrypted File Handling
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle size={14} /> Instantly Printed
            </span>
            <span className="flex items-center gap-1">
              <Smartphone size={14} /> Automated M-Pesa
            </span>
          </div>
        </div>
      </div>

      {/* Main Tabs Selection */}
      <div className="flex bg-slate-200/60 p-1.5 rounded-xl mb-8">
        <button
          onClick={() => setActiveTab('order')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-semibold text-sm transition-all duration-200 ${
            activeTab === 'order' 
              ? 'bg-white text-slate-900 shadow-md' 
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Upload size={16} /> Upload & Place Order
        </button>
        <button
          onClick={() => setActiveTab('track')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-semibold text-sm transition-all duration-200 ${
            activeTab === 'track' 
              ? 'bg-white text-slate-900 shadow-md' 
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Search size={16} /> Track My Order
        </button>
      </div>

      {/* ORDER SUBMISSION TAB */}
      {activeTab === 'order' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Columns - Form Content */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Step 1: File Upload */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center font-bold text-sm">1</div>
                <h3 className="font-bold text-slate-800 text-lg">Upload Your Document</h3>
              </div>

              {!file ? (
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 hover:border-green-500 rounded-xl p-8 text-center cursor-pointer transition-colors duration-200 bg-slate-50/50 group"
                >
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileUpload}
                    accept=".pdf,.docx,.png,.jpg,.jpeg"
                    className="hidden" 
                  />
                  {uploading ? (
                    <div className="flex flex-col items-center py-4">
                      <Loader2 className="animate-spin text-green-600 mb-3" size={36} />
                      <p className="font-semibold text-slate-700 text-sm">Uploading and scanning file...</p>
                      <p className="text-slate-400 text-xs mt-1">Verifying magic-bytes & malware signatures</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center py-2">
                      <div className="w-12 h-12 rounded-full bg-slate-100 group-hover:bg-green-50 text-slate-600 group-hover:text-green-600 flex items-center justify-center mb-3 transition-colors">
                        <Upload size={24} />
                      </div>
                      <p className="font-semibold text-slate-700 text-sm">Drag & Drop or Click to Upload</p>
                      <p className="text-slate-400 text-xs mt-1.5">PDF, DOCX, PNG, JPG (Max 50MB)</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-start gap-4">
                  <div className="p-3 bg-green-100 text-green-600 rounded-lg">
                    <FileText size={24} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 text-sm truncate">{file.originalName}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                    
                    {/* Security Check Banner */}
                    <div className="flex items-center gap-1.5 mt-2 bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-1 rounded-md text-xs w-max font-medium">
                      <Shield size={12} /> Safe Magic Bytes Verified
                    </div>
                  </div>
                  <button 
                    onClick={() => setFile(null)}
                    className="text-xs font-semibold text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 px-2.5 py-1.5 rounded-lg transition-colors"
                  >
                    Remove
                  </button>
                </div>
              )}

              {uploadError && (
                <div className="mt-3 p-3 bg-red-50 border border-red-100 rounded-lg text-xs text-red-700 flex items-start gap-2">
                  <AlertTriangle className="flex-shrink-0 mt-0.5" size={14} />
                  <div>
                    <span className="font-bold">Security Blocked:</span> {uploadError}
                  </div>
                </div>
              )}

              {securityLogs && (
                <div className="mt-3 bg-slate-900 rounded-lg p-2 font-mono text-[10px] text-slate-300 max-h-24 overflow-y-auto">
                  <span className="text-green-400 font-bold">$ mpesa-antivirus-scan:</span> {securityLogs}
                </div>
              )}
            </div>

            {/* Step 2: Configure Services */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center font-bold text-sm">2</div>
                <h3 className="font-bold text-slate-800 text-lg">Configure Options</h3>
              </div>

              {/* Dynamic Pages Count Breakdown for File */}
              {file ? (
                <div className="space-y-4 mb-6 pb-6 border-b border-slate-100">
                  <div className="p-3 bg-green-50 border border-green-100 rounded-xl flex justify-between items-center text-sm">
                    <span className="text-slate-700 font-medium">Smart Parser Page Breakdown</span>
                    <button 
                      onClick={() => setIsCustomPrintConfig(!isCustomPrintConfig)}
                      className="text-xs font-bold text-green-700 hover:text-green-900 flex items-center gap-1"
                    >
                      <RefreshCw size={12} /> {isCustomPrintConfig ? "Reset to Auto" : "Manual Override"}
                    </button>
                  </div>

                  {isCustomPrintConfig ? (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">B&W Pages</label>
                        <input 
                          type="number" 
                          min="0"
                          value={customBwPages} 
                          onChange={(e) => setCustomBwPages(Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:border-green-500 font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Color Pages</label>
                        <input 
                          type="number" 
                          min="0"
                          value={customColorPages} 
                          onChange={(e) => setCustomColorPages(Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:border-green-500 font-bold"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4 text-center">
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <span className="block text-[11px] font-bold text-slate-400 uppercase">Auto Black & White</span>
                        <span className="text-xl font-bold text-slate-800">{file.bwPages}</span>
                        <span className="text-[10px] text-slate-400 block mt-0.5">pages estimated</span>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <span className="block text-[11px] font-bold text-slate-400 uppercase">Auto Color Pages</span>
                        <span className="text-xl font-bold text-slate-800">{file.colorPages}</span>
                        <span className="text-[10px] text-slate-400 block mt-0.5">pages estimated</span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Static service selection when NO file uploaded */
                <div className="mb-4">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Select Primary Service</label>
                  {loadingServices ? (
                    <div className="animate-pulse bg-slate-100 h-10 rounded-lg" />
                  ) : (
                    <select 
                      value={selectedServiceId}
                      onChange={(e) => setSelectedServiceId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-green-500 font-medium"
                    >
                      {services
                        .filter(s => !s.name.toLowerCase().includes('spiral') && !s.name.toLowerCase().includes('lamination'))
                        .map(service => (
                          <option key={service.id} value={service.id}>
                            {service.name} — {parseFloat(service.price)} KES
                          </option>
                        ))}
                    </select>
                  )}
                </div>
              )}

              {/* Number of Copies */}
              <div className="mb-6">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Number of Copies</label>
                <div className="flex items-center gap-3">
                  <button 
                    type="button"
                    onClick={() => setCopies(Math.max(1, copies - 1))}
                    className="w-10 h-10 rounded-lg border border-slate-200 hover:border-slate-400 font-bold flex items-center justify-center text-slate-700 bg-slate-50 hover:bg-slate-100"
                  >
                    -
                  </button>
                  <span className="w-12 text-center font-extrabold text-lg text-slate-800">{copies}</span>
                  <button 
                    type="button"
                    onClick={() => setCopies(copies + 1)}
                    className="w-10 h-10 rounded-lg border border-slate-200 hover:border-slate-400 font-bold flex items-center justify-center text-slate-700 bg-slate-50 hover:bg-slate-100"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Extra Services Checklist (Spiral, Lamination) */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Optional Extras</label>
                {loadingServices ? (
                  <div className="space-y-2">
                    <div className="animate-pulse bg-slate-100 h-8 rounded-lg" />
                    <div className="animate-pulse bg-slate-100 h-8 rounded-lg" />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {services
                      .filter(s => s.name.toLowerCase().includes('spiral') || s.name.toLowerCase().includes('lamination') || s.name.toLowerCase().includes('binding'))
                      .map(service => (
                        <label 
                          key={service.id}
                          className={`border rounded-xl p-3.5 flex items-center gap-3 cursor-pointer select-none transition-all duration-150 ${
                            extras[service.id] 
                              ? 'border-green-500 bg-green-50/50 text-slate-900 font-semibold' 
                              : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <input 
                            type="checkbox"
                            checked={!!extras[service.id]}
                            onChange={() => setExtras({ ...extras, [service.id]: !extras[service.id] })}
                            className="w-4 h-4 text-green-600 border-slate-300 rounded focus:ring-green-500"
                          />
                          <div className="flex-1 min-w-0">
                            <span className="block text-xs truncate">{service.name}</span>
                            <span className="block text-[11px] font-bold text-green-600 mt-0.5">+{parseFloat(service.price)} KES</span>
                          </div>
                        </label>
                      ))}
                  </div>
                )}
              </div>

            </div>

          </div>

          {/* Right Column - Live Invoice Billing & Checkout */}
          <div className="space-y-6">
            
            <div className="bg-white rounded-2xl border-2 border-slate-900 shadow-xl p-6 relative overflow-hidden">
              <div className="absolute right-0 top-0 opacity-5 pointer-events-none translate-x-1/4 -translate-y-1/4">
                <Smartphone size={200} />
              </div>

              <h3 className="font-extrabold text-slate-900 text-lg mb-4 flex items-center gap-2">
                <ShoppingBag size={20} className="text-slate-800" /> Invoice Breakdown
              </h3>

              {/* Items List */}
              <div className="space-y-3.5 mb-6">
                {breakdown.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4">No services selected yet.</p>
                ) : (
                  breakdown.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-start text-xs text-slate-600 border-b border-dashed border-slate-100 pb-3">
                      <div className="pr-2">
                        <span className="font-semibold text-slate-800 block">{item.description}</span>
                        <span className="text-[10px] text-slate-400">{item.unitPrice} KES per unit</span>
                      </div>
                      <span className="font-bold text-slate-800 text-right">{item.total} KES</span>
                    </div>
                  ))
                )}
              </div>

              {/* Grand Total */}
              <div className="flex justify-between items-center bg-slate-50 border border-slate-100 rounded-xl p-4 mb-6">
                <span className="font-bold text-slate-600 text-xs uppercase">Total Cost</span>
                <span className="font-extrabold text-2xl text-green-600">{grandTotal} KES</span>
              </div>

              {/* M-Pesa Phone Number & Trigger STK Push */}
              <form onSubmit={handleCheckout} className="space-y-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">M-Pesa Phone Number</label>
                  <div className="relative rounded-xl shadow-sm">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                      <Smartphone className="h-4 w-4 text-slate-400" aria-hidden="true" />
                    </div>
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="e.g., 0712345678"
                      className="block w-full rounded-xl border border-slate-200 pl-9 py-2.5 text-sm focus:outline-none focus:border-green-500 font-semibold"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={grandTotal <= 0 || checkingOut}
                  className={`w-full py-3.5 px-4 rounded-xl font-bold text-sm tracking-wide text-white transition-all flex items-center justify-center gap-2 shadow-lg ${
                    grandTotal <= 0 
                      ? 'bg-slate-300 cursor-not-allowed shadow-none' 
                      : 'bg-green-600 hover:bg-green-700 shadow-green-600/10'
                  }`}
                >
                  {checkingOut ? (
                    <>
                      <Loader2 className="animate-spin" size={16} /> Creating order...
                    </>
                  ) : (
                    <>
                      <CreditCard size={16} /> Pay {grandTotal} KES via M-Pesa
                    </>
                  )}
                </button>
              </form>

              {checkoutError && (
                <div className="mt-3 p-3 bg-red-50 border border-red-100 rounded-lg text-xs text-red-600">
                  {checkoutError}
                </div>
              )}
            </div>

          </div>

        </div>
      )}

      {/* ORDER TRACKING TIMELINE TAB */}
      {activeTab === 'track' && (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-6 max-w-2xl mx-auto">
          <h3 className="font-extrabold text-slate-800 text-xl mb-4 text-center">Track Your Cyber Café Order</h3>
          <p className="text-slate-500 text-xs text-center mb-6 max-w-md mx-auto">
            Our self-service system uses no customer credentials! To track, simply input your Safaricom phone number and the order number on your invoice receipt.
          </p>

          <form onSubmit={handleTrackOrder} className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Safaricom Phone</label>
              <input 
                type="tel" 
                required
                placeholder="e.g., 0712345678"
                value={trackPhone}
                onChange={(e) => setTrackPhone(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:border-green-500 font-semibold"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Order Number</label>
              <input 
                type="text" 
                required
                placeholder="e.g., CC-123456"
                value={trackOrderNumber}
                onChange={(e) => setTrackOrderNumber(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:border-green-500 font-semibold uppercase"
              />
            </div>
            <div className="sm:col-span-2">
              <button 
                type="submit"
                disabled={trackingLoading}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors duration-150"
              >
                {trackingLoading ? <Loader2 className="animate-spin" size={16} /> : "Search Invoice & Status"}
              </button>
            </div>
          </form>

          {trackingError && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600 text-center mb-6">
              {trackingError}
            </div>
          )}

          {/* Search Result Timeline */}
          {trackingOrder && (
            <div className="border border-slate-100 rounded-2xl p-6 bg-slate-50/50 space-y-6">
              
              {/* Receipt Header */}
              <div className="flex flex-wrap gap-2 justify-between items-center border-b border-slate-100 pb-4">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Order Invoice</span>
                  <p className="text-lg font-extrabold text-slate-900">{trackingOrder.orderNumber}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Placed on {new Date(trackingOrder.createdAt).toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Grand Total</span>
                  <span className="text-xl font-extrabold text-green-600 block">{parseFloat(trackingOrder.totalAmount)} KES</span>
                  <span className={`inline-block border text-[10px] font-bold px-2 py-0.5 rounded-full mt-1 ${
                    trackingOrder.paymentStatus === 'paid' ? 'bg-green-100 text-green-800 border-green-200' : 'bg-amber-100 text-amber-800 border-amber-200'
                  }`}>
                    {trackingOrder.paymentStatus === 'paid' ? 'M-Pesa Verified' : 'Awaiting Payment'}
                  </span>
                </div>
              </div>

              {/* Items Breakdown */}
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase mb-2 block">Services Breakdown</span>
                <div className="space-y-2 bg-white rounded-xl border border-slate-100 p-3">
                  {trackingOrder.items.map((item: any) => (
                    <div key={item.id} className="flex justify-between items-center text-xs">
                      <span className="text-slate-700">{item.service_name} <span className="text-slate-400 font-bold">×{item.quantity}</span></span>
                      <span className="font-bold text-slate-800">{parseFloat(item.subtotal)} KES</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Visual Interactive Status Timeline */}
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase mb-4 block">Live Progress Status</span>
                
                <div className="relative">
                  {/* Vertical connector line */}
                  <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-slate-200" />

                  {/* Step 1: Placed */}
                  <div className="flex gap-4 items-start relative pb-6">
                    <div className="z-10 w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center font-bold text-sm shadow">
                      ✓
                    </div>
                    <div>
                      <h4 className="font-bold text-xs text-slate-800">Order Generated</h4>
                      <p className="text-[11px] text-slate-500">Invoice registered and M-Pesa push initiated.</p>
                    </div>
                  </div>

                  {/* Step 2: Paid */}
                  <div className="flex gap-4 items-start relative pb-6">
                    <div className={`z-10 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shadow ${
                      trackingOrder.paymentStatus === 'paid' 
                        ? 'bg-green-500 text-white' 
                        : 'bg-slate-200 text-slate-400'
                    }`}>
                      {trackingOrder.paymentStatus === 'paid' ? '✓' : '2'}
                    </div>
                    <div>
                      <h4 className={`font-bold text-xs ${trackingOrder.paymentStatus === 'paid' ? 'text-slate-800' : 'text-slate-400'}`}>
                        M-Pesa Confirmation
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        {trackingOrder.paymentStatus === 'paid' 
                          ? `Payment confirmed! Receipt: ${trackingOrder.mpesaReceipt || 'Daraja STK Callback Verified'}` 
                          : 'Waiting for Safaricom STK push code to be completed.'}
                      </p>
                    </div>
                  </div>

                  {/* Step 3: Printing/Processing */}
                  <div className="flex gap-4 items-start relative pb-6">
                    <div className={`z-10 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shadow ${
                      ['processing', 'ready', 'completed'].includes(trackingOrder.orderStatus)
                        ? 'bg-green-500 text-white' 
                        : (trackingOrder.orderStatus === 'paid' ? 'bg-amber-400 text-white animate-pulse' : 'bg-slate-200 text-slate-400')
                    }`}>
                      {['processing', 'ready', 'completed'].includes(trackingOrder.orderStatus) ? '✓' : '3'}
                    </div>
                    <div>
                      <h4 className={`font-bold text-xs ${['paid', 'processing', 'ready', 'completed'].includes(trackingOrder.orderStatus) ? 'text-slate-800' : 'text-slate-400'}`}>
                        Automated CUPS/Print Agent Queue
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        {['processing', 'ready', 'completed'].includes(trackingOrder.orderStatus)
                          ? 'Document processed, routed, and sent to hardware print servers.'
                          : 'Awaiting payment. Document is isolated in secured storage.'}
                      </p>
                    </div>
                  </div>

                  {/* Step 4: Ready for pickup */}
                  <div className="flex gap-4 items-start relative pb-6">
                    <div className={`z-10 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shadow ${
                      ['ready', 'completed'].includes(trackingOrder.orderStatus)
                        ? 'bg-green-500 text-white' 
                        : 'bg-slate-200 text-slate-400'
                    }`}>
                      {['ready', 'completed'].includes(trackingOrder.orderStatus) ? '✓' : '4'}
                    </div>
                    <div>
                      <h4 className={`font-bold text-xs ${['ready', 'completed'].includes(trackingOrder.orderStatus) ? 'text-slate-800' : 'text-slate-400'}`}>
                        Ready for Collection
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        {['ready', 'completed'].includes(trackingOrder.orderStatus)
                          ? 'Your document is fully printed and compiled! Present your invoice number to the attendant.'
                          : 'Attendant is yet to confirm compilation.'}
                      </p>
                    </div>
                  </div>

                  {/* Step 5: Completed */}
                  <div className="flex gap-4 items-start relative">
                    <div className={`z-10 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shadow ${
                      trackingOrder.orderStatus === 'completed'
                        ? 'bg-green-500 text-white' 
                        : 'bg-slate-200 text-slate-400'
                    }`}>
                      {trackingOrder.orderStatus === 'completed' ? '✓' : '5'}
                    </div>
                    <div>
                      <h4 className={`font-bold text-xs ${trackingOrder.orderStatus === 'completed' ? 'text-slate-800' : 'text-slate-400'}`}>
                        Order Handed Over
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        {trackingOrder.orderStatus === 'completed'
                          ? 'Completed! Thank you for using our automated self-service.'
                          : 'Attendant will sign off once papers are handed over.'}
                      </p>
                    </div>
                  </div>

                </div>
              </div>

            </div>
          )}
        </div>
      )}

      {/* DETAILED MPESA STK TRIGGER MODAL (SANDBOX SIMULATION CAPABILITIES) */}
      {paymentStatus && currentOrder && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-md w-full p-6 text-center space-y-6 relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-2 bg-green-500" />
            
            <Smartphone size={48} className="mx-auto text-green-500 animate-bounce" />

            <div>
              <h3 className="font-extrabold text-slate-900 text-xl">M-Pesa STK Push Initiated</h3>
              <p className="text-slate-500 text-xs mt-1">
                A Safaricom STK Push has been sent to handset of <span className="font-bold text-slate-800">{currentOrder.phone}</span>.
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2 text-xs">
              <div className="flex justify-between font-semibold">
                <span className="text-slate-500">Order Number</span>
                <span className="text-slate-800">{currentOrder.orderNumber}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span className="text-slate-500">Amount to Pay</span>
                <span className="text-green-600 font-extrabold">{parseFloat(currentOrder.totalAmount)} KES</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span className="text-slate-500">Checkout ID</span>
                <span className="text-slate-400 font-mono truncate max-w-[150px]">{checkoutRequestId}</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-center gap-2 text-xs text-amber-600 font-semibold bg-amber-50 border border-amber-100 p-3 rounded-xl">
                <Loader2 className="animate-spin" size={14} /> Polling Safaricom callback servers...
              </div>

              {/* Simulation Sandbox Toolbar */}
              <div className="bg-slate-900 text-slate-100 p-4 rounded-2xl space-y-2 border border-slate-800 text-left mt-4">
                <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-1.5">
                  <span>Developer Sandbox Toolbar</span>
                  <span className="text-green-500">ONLINE</span>
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Since you are on a testing sandboxed environment, we provided direct manual payment triggers to bypass live Safaricom SMS prompts!
                </p>
                <div className="grid grid-cols-2 gap-2 pt-1.5">
                  <button
                    type="button"
                    disabled={simulatingCallback}
                    onClick={() => triggerSimulationCallback(true)}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-2.5 rounded-lg text-xs flex items-center justify-center gap-1 shadow-sm transition-colors"
                  >
                    {simulatingCallback ? <Loader2 className="animate-spin" size={10} /> : "Simulate Success"}
                  </button>
                  <button
                    type="button"
                    disabled={simulatingCallback}
                    onClick={() => triggerSimulationCallback(false)}
                    className="bg-red-600 hover:bg-red-500 text-white font-bold py-2 px-2.5 rounded-lg text-xs flex items-center justify-center gap-1 shadow-sm transition-colors"
                  >
                    Simulate Cancel
                  </button>
                </div>
              </div>
            </div>

            {paymentStatus === 'paid' && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-bold flex flex-col items-center gap-1 animate-pulse">
                <CheckCircle size={20} /> Payment Success Callback Received!
                <span className="font-normal text-[10px] text-emerald-600">The documents have been sent to the print servers.</span>
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
                className="text-xs font-bold text-slate-500 hover:text-slate-800 underline"
              >
                Close and Track Order Manually
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
