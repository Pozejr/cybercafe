import React, { useState, useEffect } from 'react';
import { 
  Printer, Users, DollarSign, ListOrdered, FileText, 
  Settings, LogOut, Loader2, Check, X, ShieldAlert, 
  Plus, Edit, Trash2, TrendingUp, Calendar, AlertCircle, Play, RefreshCw
} from 'lucide-react';

interface StaffDashboardProps {
  apiBase: string;
}

export default function StaffDashboard({ apiBase }: StaffDashboardProps) {
  // Authentication State
  const [token, setToken] = useState<string | null>(localStorage.getItem('staff_token'));
  const [user, setUser] = useState<any | null>(JSON.parse(localStorage.getItem('staff_user') || 'null'));
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  // Layout & Navigation State
  const [activeTab, setActiveTab] = useState<'orders' | 'print' | 'services' | 'revenue' | 'staff'>('orders');

  // Business Data State
  const [orders, setOrders] = useState<any[]>([]);
  const [printQueue, setPrintQueue] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [stats, setStats] = useState<any | null>(null);
  const [staffList, setStaffList] = useState<any[]>([]);

  // Loading States
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [loadingServices, setLoadingServices] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  const [loadingStaff, setLoadingStaff] = useState(false);

  // Forms / Modals States
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [editingService, setEditingService] = useState<any | null>(null);
  const [serviceForm, setServiceForm] = useState({ name: '', price: 0 });

  const [showStaffModal, setShowStaffModal] = useState(false);
  const [staffForm, setStaffForm] = useState({ name: '', email: '', password: '', role: 'attendant' });
  const [staffError, setStaffError] = useState<string | null>(null);

  // Virtual CUPS Print Agent Logs simulator state
  const [agentLogs, setAgentLogs] = useState<string[]>([
    'CUPS: Core Linux service started on local network port 631.',
    'CUPS: Registered Virtual HP LaserJet 400 Pro (Ready)',
    'CUPS: Connected to Cyber Cafe API websocket server.'
  ]);

  // Handle Logout
  const handleLogout = () => {
    localStorage.removeItem('staff_token');
    localStorage.removeItem('staff_user');
    setToken(null);
    setUser(null);
  };

  // Fetch orders feed
  const fetchOrders = async () => {
    if (!token) return;
    try {
      setLoadingOrders(true);
      const res = await fetch(`${apiBase}/orders`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setOrders(data.orders);
      }
    } catch (e) {
      console.error('Failed to fetch orders:', e);
    } finally {
      setLoadingOrders(false);
    }
  };

  // Fetch Services List
  const fetchServices = async () => {
    try {
      setLoadingServices(true);
      const res = await fetch(`${apiBase}/services`);
      const data = await res.json();
      if (data.success) {
        setServices(data.services);
      }
    } catch (e) {
      console.error('Failed to fetch services:', e);
    } finally {
      setLoadingServices(false);
    }
  };

  // Fetch Stats
  const fetchStats = async () => {
    if (!token) return;
    try {
      setLoadingStats(true);
      const res = await fetch(`${apiBase}/dashboard/stats`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setStats(data.stats);
      }
    } catch (e) {
      console.error('Failed to fetch stats:', e);
    } finally {
      setLoadingStats(false);
    }
  };

  // Fetch Staff List
  const fetchStaff = async () => {
    if (!token || user?.role !== 'owner') return;
    try {
      setLoadingStaff(true);
      const res = await fetch(`${apiBase}/dashboard/staff`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setStaffList(data.staff);
      }
    } catch (e) {
      console.error('Failed to fetch staff:', e);
    } finally {
      setLoadingStaff(false);
    }
  };

  // Triggered on tab changes
  useEffect(() => {
    if (token) {
      fetchOrders();
      fetchServices();
      fetchStats();
      fetchStaff();
    }
  }, [token, activeTab]);

  // Handle Login Form Submit
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoginLoading(true);

    try {
      const res = await fetch(`${apiBase}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const data = await res.json();

      if (data.success) {
        localStorage.setItem('staff_token', data.token);
        localStorage.setItem('staff_user', JSON.stringify(data.user));
        setToken(data.token);
        setUser(data.user);
      } else {
        setLoginError(data.error || 'Login failed. Check your email and password.');
      }
    } catch (err) {
      setLoginError('Network connection error.');
    } finally {
      setLoginLoading(false);
    }
  };

  // Handle Order Status Changes
  const updateStatus = async (orderId: string, orderStatus: string, paymentStatus?: string) => {
    try {
      const res = await fetch(`${apiBase}/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ orderStatus, paymentStatus }),
      });
      const data = await res.json();
      if (data.success) {
        fetchOrders();
        fetchStats();
      }
    } catch (e) {
      console.error('Error updating order:', e);
    }
  };

  // Print Queue Simulator: Triggers virtual mechanical hardware print execution
  const processDirectHardwarePrint = async (order: any) => {
    const printerName = 'HP-LaserJet-M402-CUPS';
    
    // Add realistic CUPS execution trace logs
    setAgentLogs((prev) => [
      ...prev,
      `CUPS [INFO]: Initiating physical secure stream for Order ${order.order_number}...`,
      `CUPS [FETCH]: Downloading file payload using secured signed 5-minute token...`,
      `CUPS [EXEC]: gs -dNOPAUSE -dBATCH -sDEVICE=pdfwrite -sOutputFile=/tmp/job.pdf "${order.file_path}"`,
      `CUPS [PRINT]: Sending job payload (Total Pages: ${order.pages}) to hardware printer: ${printerName}`,
    ]);

    // Simulate page printing timer feedback
    setTimeout(() => {
      setAgentLogs((prev) => [
        ...prev,
        `PRINTER [HP-LaserJet]: Feed rollers active. Warming fuser assembly...`,
        `PRINTER [HP-LaserJet]: Printing Page 1 of ${order.pages} (${order.color_pages} Color / ${order.bw_pages} B&W)...`,
        `PRINTER [HP-LaserJet]: Finished compiling sheets for invoice ${order.order_number}!`,
        `CUPS [SUCCESS]: Hardware print execution thread returned Exit Code 0.`
      ]);
      
      // Update DB order status to ready (since printing is fully completed)
      updateStatus(order.id, 'ready');
    }, 4000);
  };

  // CRUD Service Submit
  const handleServiceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const method = editingService ? 'PUT' : 'POST';
      const url = editingService ? `${apiBase}/services/${editingService.id}` : `${apiBase}/services`;
      
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: serviceForm.name,
          price: Number(serviceForm.price),
        }),
      });

      const data = await res.json();
      if (data.success) {
        setShowServiceModal(false);
        setEditingService(null);
        setServiceForm({ name: '', price: 0 });
        fetchServices();
      }
    } catch (e) {
      console.error('Failed to submit service CRUD:', e);
    }
  };

  // Delete Service
  const deleteService = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this service?')) return;
    try {
      const res = await fetch(`${apiBase}/services/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        fetchServices();
      }
    } catch (e) {
      console.error('Failed to delete service:', e);
    }
  };

  // CRUD Staff Submit
  const handleStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStaffError(null);
    try {
      const res = await fetch(`${apiBase}/dashboard/staff`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(staffForm),
      });

      const data = await res.json();
      if (data.success) {
        setShowStaffModal(false);
        setStaffForm({ name: '', email: '', password: '', role: 'attendant' });
        fetchStaff();
      } else {
        setStaffError(data.error || 'Failed to add staff member.');
      }
    } catch (e) {
      setStaffError('Network error occurred.');
    }
  };

  // Delete Staff
  const deleteStaff = async (id: string) => {
    if (!window.confirm('Are you sure you want to remove this staff member?')) return;
    try {
      const res = await fetch(`${apiBase}/dashboard/staff/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        fetchStaff();
      } else {
        alert(data.error || 'Failed to delete staff member.');
      }
    } catch (e) {
      console.error('Failed to delete staff:', e);
    }
  };

  // Custom styling helper
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-amber-100 text-amber-800 font-bold';
      case 'paid': return 'bg-blue-100 text-blue-800 font-bold';
      case 'processing': return 'bg-purple-100 text-purple-800 font-bold animate-pulse';
      case 'ready': return 'bg-emerald-100 text-emerald-800 font-bold';
      case 'completed': return 'bg-slate-100 text-slate-800';
      default: return 'bg-slate-100 text-slate-800';
    }
  };

  // ==========================================
  // VIEW: LOGIN INTERFACE (IF NO TOKEN)
  // ==========================================
  if (!token) {
    return (
      <div className="max-w-md mx-auto my-16 px-4">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-sky-400 to-indigo-500" />
          
          <div className="text-center space-y-2 mb-6">
            <Printer size={40} className="mx-auto text-sky-400" />
            <h2 className="text-xl font-extrabold text-slate-100 tracking-tight">Cyber Café Staff Portal</h2>
            <p className="text-xs text-slate-400">Owner or Attendant credentials required for database session</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Staff Email</label>
              <input 
                type="email" 
                required
                placeholder="e.g., attendant@cyber.com"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="w-full bg-slate-800/80 border border-slate-700 rounded-xl py-2.5 px-3 text-sm text-slate-100 focus:outline-none focus:border-sky-500 font-medium"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Password</label>
              <input 
                type="password" 
                required
                placeholder="password123"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full bg-slate-800/80 border border-slate-700 rounded-xl py-2.5 px-3 text-sm text-slate-100 focus:outline-none focus:border-sky-500 font-medium"
              />
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full bg-sky-500 hover:bg-sky-600 disabled:bg-slate-700 text-white font-bold py-3 px-4 rounded-xl text-sm transition-colors duration-150 flex items-center justify-center gap-2"
            >
              {loginLoading ? <Loader2 className="animate-spin" size={16} /> : "Authenticate Secure Session"}
            </button>
          </form>

          {loginError && (
            <div className="mt-4 p-3.5 bg-red-950/50 border border-red-900 text-red-400 rounded-xl text-xs flex gap-2 items-start">
              <ShieldAlert size={16} className="flex-shrink-0" />
              <div>{loginError}</div>
            </div>
          )}

          <div className="mt-6 border-t border-slate-800 pt-4 text-center">
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Default Seeded logins:<br />
              <span className="font-bold text-slate-400">owner@cyber.com</span> (or) <span className="font-bold text-slate-400">attendant@cyber.com</span><br />
              Password: <span className="font-bold text-slate-400">password123</span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW: FULL STAFF DASHBOARD INTERFACE
  // ==========================================
  return (
    <div className="flex flex-col md:flex-row min-h-[600px] rounded-3xl border border-slate-200 bg-white overflow-hidden shadow-xl my-6">
      
      {/* Sidebar Controls */}
      <div className="w-full md:w-64 bg-slate-900 text-slate-300 p-6 flex flex-col justify-between">
        <div className="space-y-6">
          {/* Logo / Title */}
          <div className="border-b border-slate-800 pb-4">
            <h3 className="font-extrabold text-white text-md flex items-center gap-2">
              <Printer className="text-sky-400" size={18} /> Cyber Dashboard
            </h3>
            <span className="text-[10px] text-slate-500 font-semibold block mt-0.5 uppercase tracking-widest">{user?.cyberName || 'Mega Cyber Cafe'}</span>
          </div>

          {/* Nav Items */}
          <nav className="space-y-1.5">
            <button
              onClick={() => setActiveTab('orders')}
              className={`w-full text-left py-2.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                activeTab === 'orders' ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/10' : 'hover:bg-slate-800 text-slate-400 hover:text-slate-100'
              }`}
            >
              <ListOrdered size={14} /> Orders Feed ({orders.length})
            </button>

            <button
              onClick={() => setActiveTab('print')}
              className={`w-full text-left py-2.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                activeTab === 'print' ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/10' : 'hover:bg-slate-800 text-slate-400 hover:text-slate-100'
              }`}
            >
              <Printer size={14} /> Auto Print Queue ({orders.filter(o => o.payment_status === 'paid' && o.order_status === 'paid').length})
            </button>

            <button
              onClick={() => setActiveTab('services')}
              className={`w-full text-left py-2.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                activeTab === 'services' ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/10' : 'hover:bg-slate-800 text-slate-400 hover:text-slate-100'
              }`}
            >
              <Settings size={14} /> Services Control ({services.length})
            </button>

            <button
              onClick={() => setActiveTab('revenue')}
              className={`w-full text-left py-2.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                activeTab === 'revenue' ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/10' : 'hover:bg-slate-800 text-slate-400 hover:text-slate-100'
              }`}
            >
              <TrendingUp size={14} /> Revenue Statistics
            </button>

            {user?.role === 'owner' && (
              <button
                onClick={() => setActiveTab('staff')}
                className={`w-full text-left py-2.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                  activeTab === 'staff' ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/10' : 'hover:bg-slate-800 text-slate-400 hover:text-slate-100'
                }`}
              >
                <Users size={14} /> Staff Management ({staffList.length})
              </button>
            )}
          </nav>
        </div>

        {/* User profile & Logout */}
        <div className="border-t border-slate-800 pt-4 mt-6">
          <div className="text-xs text-slate-400 mb-2">
            <span className="block font-bold text-slate-200">{user?.name}</span>
            <span className="block text-[10px] text-slate-500 font-semibold capitalize">{user?.role}</span>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-red-950/30 hover:bg-red-950 text-red-400 text-xs font-bold transition-colors"
          >
            <LogOut size={12} /> Sign Out Session
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 bg-slate-50/70 p-6 overflow-y-auto">
        
        {/* TAB 1: ORDERS FEED */}
        {activeTab === 'orders' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-extrabold text-slate-800 text-xl">Orders Feed</h3>
                <p className="text-slate-500 text-xs">Real-time incoming customer self-service uploads and purchases</p>
              </div>
              <button onClick={fetchOrders} className="p-2 border bg-white rounded-lg hover:bg-slate-50">
                <RefreshCw size={14} className={loadingOrders ? 'animate-spin' : ''} />
              </button>
            </div>

            {loadingOrders ? (
              <div className="flex justify-center py-16"><Loader2 className="animate-spin text-sky-500" size={32} /></div>
            ) : orders.length === 0 ? (
              <div className="bg-white border rounded-2xl p-12 text-center text-slate-400 text-sm">No orders registered in the database.</div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {orders.map((order) => (
                  <div key={order.id} className="bg-white border rounded-2xl p-4 shadow-sm flex flex-col md:flex-row justify-between gap-4">
                    <div className="space-y-2 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-slate-900">{order.order_number}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${getStatusColor(order.order_status)}`}>
                          {order.order_status}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${order.payment_status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                          {order.payment_status === 'paid' ? 'Paid (M-Pesa)' : 'Unpaid'}
                        </span>
                      </div>

                      <div className="text-xs text-slate-500 space-y-1">
                        <p><span className="font-bold">Customer Phone:</span> {order.phone}</p>
                        <p><span className="font-bold">Placed:</span> {new Date(order.created_at).toLocaleString()}</p>
                      </div>

                      {/* Document Meta Info if has files */}
                      {order.file_path && (
                        <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-100 text-xs flex items-center justify-between gap-2 max-w-md">
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText size={16} className="text-sky-500 flex-shrink-0" />
                            <span className="font-semibold text-slate-700 truncate">{order.file_path}</span>
                          </div>
                          <span className="font-bold text-slate-500 text-[10px] bg-slate-200 px-1.5 py-0.5 rounded">
                            {order.pages} Pages ({order.color_pages} C / {order.bw_pages} B&W)
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-row md:flex-col justify-between items-end gap-2 border-t md:border-t-0 pt-3 md:pt-0">
                      <div className="text-right">
                        <span className="text-[10px] font-semibold text-slate-400 block uppercase">Total Cost</span>
                        <span className="font-extrabold text-lg text-green-600 block">{parseFloat(order.total_amount)} KES</span>
                      </div>

                      {/* Dropdown controls to update orders manually */}
                      <div className="flex gap-1">
                        {order.payment_status === 'pending' && (
                          <button
                            onClick={() => updateStatus(order.id, 'paid', 'paid')}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-1.5 px-2.5 rounded-lg"
                          >
                            Mark Cash Paid
                          </button>
                        )}
                        <select
                          value={order.order_status}
                          onChange={(e) => updateStatus(order.id, e.target.value)}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs py-1.5 px-2.5 rounded-lg border-none focus:outline-none cursor-pointer"
                        >
                          <option value="pending">Pending</option>
                          <option value="paid">Paid</option>
                          <option value="processing">Processing</option>
                          <option value="ready">Ready</option>
                          <option value="completed">Completed</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: AUTOMATED PRINT QUEUE */}
        {activeTab === 'print' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-extrabold text-slate-800 text-xl">Automated Hardware Print Queue</h3>
                <p className="text-slate-500 text-xs">Displays paid orders only. Print directly with NO manual downloading.</p>
              </div>
              <button onClick={fetchOrders} className="p-2 border bg-white rounded-lg hover:bg-slate-50">
                <RefreshCw size={14} />
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Queue Listing */}
              <div className="lg:col-span-2 space-y-4">
                {orders.filter(o => o.payment_status === 'paid' && o.order_status !== 'completed' && o.order_status !== 'ready').length === 0 ? (
                  <div className="bg-white border rounded-2xl p-12 text-center text-slate-400 text-sm">
                    No active paid printing jobs in the queue.
                  </div>
                ) : (
                  orders
                    .filter(o => o.payment_status === 'paid' && o.order_status !== 'completed' && o.order_status !== 'ready')
                    .map((order) => (
                      <div key={order.id} className="bg-white border-2 border-slate-900 rounded-2xl p-4 flex justify-between items-center shadow-sm">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-slate-900">{order.order_number}</span>
                            <span className="bg-blue-100 text-blue-800 text-[10px] font-extrabold px-2 py-0.5 rounded">M-Pesa Paid</span>
                          </div>
                          <p className="text-xs font-semibold text-slate-700">File: {order.file_path || 'Direct Printing Service'}</p>
                          <p className="text-[11px] text-slate-500">
                            Pages: <span className="font-bold text-slate-700">{order.pages || 1}</span> ({order.color_pages || 0} Color / {order.bw_pages || 0} B&W)
                          </p>
                        </div>

                        <button
                          onClick={() => processDirectHardwarePrint(order)}
                          className="bg-sky-500 hover:bg-sky-600 text-white font-extrabold text-xs py-2.5 px-4 rounded-xl flex items-center gap-1.5 shadow-md shadow-sky-500/10"
                        >
                          <Play size={12} fill="white" /> Execute Print Direct
                        </button>
                      </div>
                    ))
                )}
              </div>

              {/* Print Agent Logger Monitor Terminal */}
              <div className="bg-slate-950 border border-slate-900 rounded-2xl p-4 flex flex-col justify-between h-[380px] text-slate-100 font-mono text-[11px] shadow-lg">
                <div className="space-y-2 overflow-y-auto pr-1">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2 text-slate-400 font-bold">
                    <span>CUPS Agent Terminal</span>
                    <span className="animate-pulse bg-green-500 w-2 h-2 rounded-full" />
                  </div>
                  {agentLogs.map((log, index) => (
                    <p key={index} className="leading-relaxed">
                      <span className="text-slate-500">$</span> {log}
                    </p>
                  ))}
                </div>
                <div className="border-t border-slate-800 pt-3 text-slate-500 flex justify-between">
                  <span>CUPS daemon: v2.4.2</span>
                  <button 
                    onClick={() => setAgentLogs([
                      'CUPS: Core Linux service started on local network port 631.',
                      'CUPS: Registered Virtual HP LaserJet 400 Pro (Ready)'
                    ])}
                    className="text-[10px] text-slate-400 hover:text-slate-100 hover:underline"
                  >
                    Clear log
                  </button>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* TAB 3: SERVICES CRUD */}
        {activeTab === 'services' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-extrabold text-slate-800 text-xl">Services & Pricing Control</h3>
                <p className="text-slate-500 text-xs">Directly CRUD services. Price changes immediately update customer-side estimates.</p>
              </div>
              <button 
                onClick={() => {
                  setEditingService(null);
                  setServiceForm({ name: '', price: 0 });
                  setShowServiceModal(true);
                }}
                className="bg-sky-500 hover:bg-sky-600 text-white font-bold text-xs py-2 px-3 rounded-xl flex items-center gap-1.5"
              >
                <Plus size={14} /> Add Service
              </button>
            </div>

            {loadingServices ? (
              <div className="flex justify-center py-16"><Loader2 className="animate-spin text-sky-500" size={32} /></div>
            ) : services.length === 0 ? (
              <div className="bg-white border rounded-2xl p-12 text-center text-slate-400 text-sm">No services listed. Add one to begin.</div>
            ) : (
              <div className="bg-white border rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100/80 text-slate-500 font-bold uppercase border-b border-slate-100">
                    <tr>
                      <th className="p-4">Service Name</th>
                      <th className="p-4">Unit Price</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {services.map((service) => (
                      <tr key={service.id} className="hover:bg-slate-50/50">
                        <td className="p-4 font-bold text-slate-800">{service.name}</td>
                        <td className="p-4 font-extrabold text-green-600">{parseFloat(service.price)} KES</td>
                        <td className="p-4 text-right flex gap-1 justify-end">
                          <button
                            onClick={() => {
                              setEditingService(service);
                              setServiceForm({ name: service.name, price: parseFloat(service.price) });
                              setShowServiceModal(true);
                            }}
                            className="p-1.5 hover:bg-slate-100 text-slate-600 rounded"
                          >
                            <Edit size={14} />
                          </button>
                          <button
                            onClick={() => deleteService(service.id)}
                            className="p-1.5 hover:bg-red-50 text-red-600 rounded"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: REVENUE STATS */}
        {activeTab === 'revenue' && (
          <div className="space-y-6">
            <div>
              <h3 className="font-extrabold text-slate-800 text-xl">Revenue Dashboard</h3>
              <p className="text-slate-500 text-xs">Aggregated analytics and tracking of cyber café financial metrics</p>
            </div>

            {loadingStats || !stats ? (
              <div className="flex justify-center py-16"><Loader2 className="animate-spin text-sky-500" size={32} /></div>
            ) : (
              <div className="space-y-6">
                
                {/* Stat Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  <div className="bg-white border rounded-2xl p-5 shadow-sm space-y-2">
                    <span className="text-[11px] font-bold text-slate-400 uppercase">Today's Revenue</span>
                    <p className="text-2xl font-extrabold text-green-600">{stats.dailyRevenue} KES</p>
                    <span className="text-[10px] text-slate-400 block">Confirmed M-Pesa sales today</span>
                  </div>

                  <div className="bg-white border rounded-2xl p-5 shadow-sm space-y-2">
                    <span className="text-[11px] font-bold text-slate-400 uppercase">Weekly Revenue</span>
                    <p className="text-2xl font-extrabold text-slate-800">{stats.weeklyRevenue} KES</p>
                    <span className="text-[10px] text-slate-400 block">Confirmed M-Pesa sales this week</span>
                  </div>

                  <div className="bg-white border rounded-2xl p-5 shadow-sm space-y-2">
                    <span className="text-[11px] font-bold text-slate-400 uppercase">Monthly Revenue</span>
                    <p className="text-2xl font-extrabold text-slate-800">{stats.monthlyRevenue} KES</p>
                    <span className="text-[10px] text-slate-400 block">Sales since start of month</span>
                  </div>
                </div>

                {/* Best Selling & Order status charts grids */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  
                  {/* Best Selling List */}
                  <div className="bg-white border rounded-2xl p-5 shadow-sm space-y-4">
                    <h4 className="font-bold text-slate-800 text-sm border-b pb-2">Top Selling Services</h4>
                    <div className="space-y-3">
                      {stats.bestSellingServices.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-4">No verified sales statistics.</p>
                      ) : (
                        stats.bestSellingServices.map((svc: any, idx: number) => (
                          <div key={idx} className="flex justify-between items-center text-xs">
                            <span className="text-slate-700 font-medium">{svc.service_name} (×{svc.sales_count})</span>
                            <span className="font-extrabold text-green-600">{parseFloat(svc.total_revenue)} KES</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Orders Status Summary Breakdown */}
                  <div className="bg-white border rounded-2xl p-5 shadow-sm space-y-4">
                    <h4 className="font-bold text-slate-800 text-sm border-b pb-2">Orders Status Breakdown</h4>
                    <div className="grid grid-cols-2 gap-4 text-center">
                      <div className="p-3 bg-amber-50 rounded-xl border border-amber-100">
                        <span className="text-[10px] font-bold text-amber-600 block uppercase">Pending</span>
                        <span className="text-xl font-extrabold text-slate-800">{stats.ordersBreakdown.pending || 0}</span>
                      </div>
                      <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
                        <span className="text-[10px] font-bold text-blue-600 block uppercase">Paid</span>
                        <span className="text-xl font-extrabold text-slate-800">{stats.ordersBreakdown.paid || 0}</span>
                      </div>
                      <div className="p-3 bg-purple-50 rounded-xl border border-purple-100">
                        <span className="text-[10px] font-bold text-purple-600 block uppercase">Processing</span>
                        <span className="text-xl font-extrabold text-slate-800">{stats.ordersBreakdown.processing || 0}</span>
                      </div>
                      <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                        <span className="text-[10px] font-bold text-emerald-600 block uppercase">Ready / Picked</span>
                        <span className="text-xl font-extrabold text-slate-800">{(stats.ordersBreakdown.ready || 0) + (stats.ordersBreakdown.completed || 0)}</span>
                      </div>
                    </div>
                  </div>

                </div>

              </div>
            )}
          </div>
        )}

        {/* TAB 5: STAFF MANAGEMENT */}
        {activeTab === 'staff' && user?.role === 'owner' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-extrabold text-slate-800 text-xl">Staff Management</h3>
                <p className="text-slate-500 text-xs">Owner controls. Add and remove attendants or assign roles.</p>
              </div>
              <button 
                onClick={() => {
                  setStaffError(null);
                  setStaffForm({ name: '', email: '', password: '', role: 'attendant' });
                  setShowStaffModal(true);
                }}
                className="bg-sky-500 hover:bg-sky-600 text-white font-bold text-xs py-2 px-3 rounded-xl flex items-center gap-1.5"
              >
                <Plus size={14} /> Add Staff Member
              </button>
            </div>

            {loadingStaff ? (
              <div className="flex justify-center py-16"><Loader2 className="animate-spin text-sky-500" size={32} /></div>
            ) : staffList.length === 0 ? (
              <div className="bg-white border rounded-2xl p-12 text-center text-slate-400 text-sm">No staff registered in database.</div>
            ) : (
              <div className="bg-white border rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100/80 text-slate-500 font-bold uppercase border-b border-slate-100">
                    <tr>
                      <th className="p-4">Staff Name</th>
                      <th className="p-4">Email</th>
                      <th className="p-4">Role</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {staffList.map((st) => (
                      <tr key={st.id} className="hover:bg-slate-50/50">
                        <td className="p-4 font-bold text-slate-800">{st.name}</td>
                        <td className="p-4 text-slate-600 font-medium">{st.email}</td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold capitalize ${
                            st.role === 'owner' ? 'bg-purple-100 text-purple-800' : 'bg-slate-100 text-slate-800'
                          }`}>
                            {st.role}
                          </span>
                        </td>
                        <td className="p-4 text-right flex gap-1 justify-end">
                          {st.id !== user.id ? (
                            <button
                              onClick={() => deleteStaff(st.id)}
                              className="p-1.5 hover:bg-red-50 text-red-600 rounded"
                            >
                              <Trash2 size={14} />
                            </button>
                          ) : (
                            <span className="text-[10px] font-bold text-slate-400 px-2 py-1">Active Self</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </div>

      {/* ==========================================
          MODAL: ADD/EDIT SERVICE FORM
      ========================================== */}
      {showServiceModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form onSubmit={handleServiceSubmit} className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <h3 className="font-extrabold text-slate-900 text-lg">
              {editingService ? "Update Pricing Service" : "Add Service Item"}
            </h3>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Service Name</label>
              <input 
                type="text" 
                required
                value={serviceForm.name}
                onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm focus:outline-none focus:border-sky-500 font-semibold"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Unit Price (KES)</label>
              <input 
                type="number" 
                required
                min="1"
                step="0.5"
                value={serviceForm.price}
                onChange={(e) => setServiceForm({ ...serviceForm, price: parseFloat(e.target.value) || 0 })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm focus:outline-none focus:border-sky-500 font-bold"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowServiceModal(false)}
                className="flex-1 py-2 px-3 border rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2 px-3 bg-sky-500 hover:bg-sky-600 text-white font-bold text-xs rounded-xl shadow-md"
              >
                Save service
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ==========================================
          MODAL: ADD STAFF FORM
      ========================================== */}
      {showStaffModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form onSubmit={handleStaffSubmit} className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <h3 className="font-extrabold text-slate-900 text-lg">Add Staff Member</h3>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Staff Name</label>
              <input 
                type="text" 
                required
                value={staffForm.name}
                onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm focus:outline-none focus:border-sky-500 font-semibold"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Email Address</label>
              <input 
                type="email" 
                required
                value={staffForm.email}
                onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm focus:outline-none focus:border-sky-500 font-semibold"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Temporal Password</label>
              <input 
                type="password" 
                required
                value={staffForm.password}
                onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm focus:outline-none focus:border-sky-500 font-semibold"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Role Type</label>
              <select
                value={staffForm.role}
                onChange={(e) => setStaffForm({ ...staffForm, role: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm focus:outline-none focus:border-sky-500 font-semibold"
              >
                <option value="attendant">Attendant</option>
                <option value="owner">Owner (Full Privileges)</option>
              </select>
            </div>

            {staffError && (
              <div className="p-2 bg-red-50 text-red-600 text-xs rounded border border-red-100 font-semibold text-center">
                {staffError}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowStaffModal(false)}
                className="flex-1 py-2 px-3 border rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2 px-3 bg-sky-500 hover:bg-sky-600 text-white font-bold text-xs rounded-xl shadow-md"
              >
                Add staff
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}
