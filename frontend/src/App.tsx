import React, { useState } from 'react';
import PublicCafe from './components/PublicCafe';
import StaffDashboard from './components/StaffDashboard';
import { ShieldCheck, Printer, User, HelpCircle, ArrowRight } from 'lucide-react';

const apiBase = import.meta.env.VITE_API_BASE_URL; // Proxied in vite.config.ts

export default function App() {
  const [activePortal, setActivePortal] = useState<'customer' | 'staff'>('customer');

  const handleOrderCreatedNotification = (orderId: string, orderNumber: string, phone: string) => {
    console.log(`[APP] Order created! ID: ${orderId}, No: ${orderNumber}, Phone: ${phone}`);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
      
      {/* GLOBAL ARCHITECTURE BANNER */}
      <header className="bg-slate-900 text-white border-b border-slate-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          
          {/* Logo & Stack Title */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center text-slate-900 shadow-md shadow-green-500/10">
              <Printer size={20} strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="font-extrabold text-sm tracking-tight flex items-center gap-1.5">
                CYBER CAFÉ SYSTEM <span className="bg-slate-800 text-slate-400 text-[10px] py-0.5 px-2 rounded-md font-semibold font-mono">v1.0.0</span>
              </h1>
              <p className="text-[10px] text-slate-400 font-medium">React + TS + Tailwind &bull; Express + Postgres &bull; Safaricom Daraja</p>
            </div>
          </div>

          {/* Quick Sandbox Navigation Toggle */}
          <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700">
            <button
              onClick={() => setActivePortal('customer')}
              className={`py-1.5 px-3.5 rounded-lg text-xs font-bold tracking-wide transition-all ${
                activePortal === 'customer' 
                  ? 'bg-green-500 text-slate-900 shadow-sm' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Customer Portal
            </button>
            <button
              onClick={() => setActivePortal('staff')}
              className={`py-1.5 px-3.5 rounded-lg text-xs font-bold tracking-wide transition-all ${
                activePortal === 'staff' 
                  ? 'bg-sky-500 text-slate-900 shadow-sm' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Attendant Portal
            </button>
          </div>

          {/* Core Security Badge */}
          <div className="hidden lg:flex items-center gap-2 bg-slate-800/50 border border-slate-800 rounded-xl px-3.5 py-1.5 text-xs text-slate-300">
            <ShieldCheck size={14} className="text-green-400" />
            <span className="font-semibold">Malware Defense Active</span>
          </div>

        </div>
      </header>

      {/* PORTAL BODY CONTAINER */}
      <main className="flex-grow">
        {activePortal === 'customer' ? (
          <PublicCafe 
            onOrderCreated={handleOrderCreatedNotification} 
            apiBase={apiBase} 
          />
        ) : (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <StaffDashboard apiBase={apiBase} />
          </div>
        )}
      </main>

      {/* COMPREHENSIVE REGULATORY COMPLIANCE FOOTER */}
      <footer className="bg-slate-900 text-slate-400 border-t border-slate-800 py-8 text-xs mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-3 gap-8">
          
          <div className="space-y-3">
            <p className="font-bold text-slate-200 text-sm flex items-center gap-1.5">
              <ShieldCheck className="text-green-500" size={16} /> Data Security & Isolation
            </p>
            <p className="leading-relaxed text-slate-400">
              Customer privacy is prioritized. Zero user accounts or public files are exposed. Uploaded documents reside securely outside the public web root and are accessed exclusively through short-lived cryptographic signed tokens and auth-controlled streams.
            </p>
          </div>

          <div className="space-y-3">
            <p className="font-bold text-slate-200 text-sm flex items-center gap-1.5">
              <Printer className="text-sky-400" size={16} /> Automated CUPS Integration
            </p>
            <p className="leading-relaxed text-slate-400">
              Future-ready driver queues listening directly via websockets. Linux CUPS server and Windows Spooler background agents can fetch paid jobs instantly. Attendants handle paper, not digital file organization.
            </p>
          </div>

          <div className="space-y-3">
            <p className="font-bold text-slate-200 text-sm flex items-center gap-1.5">
              <HelpCircle className="text-slate-300" size={16} /> Offline Sandbox Verification
            </p>
            <p className="leading-relaxed text-slate-400">
              Fully complete with M-Pesa STK Daraja simulations. Test files can be uploaded and configured, then mock STK Push callbacks are manually triggered to test the automated addition to the printing queue.
            </p>
          </div>

        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center border-t border-slate-850 pt-6 mt-8 text-slate-500 font-medium">
          <p>© 2026 Mega Cyber Café System. Developed under production-grade standards for small cyber cafés in Kenya.</p>
        </div>
      </footer>

    </div>
  );
}
