import { Router } from 'express';
import { loginStaff } from '../controllers/authController';
import { createOrder, getOrderStatus, listOrders, getOrderDetails, updateOrderStatus } from '../controllers/orderController';
import { getServices, createService, updateService, deleteService } from '../controllers/serviceController';
import { initiatePayment, paymentCallback, simulatePaymentSuccess, simulatePaymentFailure } from '../controllers/paymentController';
import { getDashboardStats, getStaffMembers, addStaffMember, deleteStaffMember } from '../controllers/dashboardController';
import { uploadDocument, secureStreamDocument, getSignedFileToken, streamByToken } from '../controllers/uploadController';
import { upload } from '../middleware/uploadMiddleware';
import { authenticateStaff, requireOwner } from '../middleware/authMiddleware';

const router = Router();

// ==========================================
// PUBLIC ROUTES (NO AUTH REQUIRED)
// ==========================================

// Auth Login (Staff Entrypoint)
router.post('/auth/login', loginStaff);

// Document Upload & Analysis
router.post('/upload', upload.any(), uploadDocument);

// Order Placement & Tracking
router.post('/order/create', createOrder);
router.get('/order/status', getOrderStatus);

// M-Pesa Lipa Na M-Pesa Pay
router.post('/payment/initiate', initiatePayment);
router.post('/payment/callback', paymentCallback);

// Developer Sandbox payment simulators
router.post('/payment/simulate-success', simulatePaymentSuccess);
router.post('/payment/simulate-failure', simulatePaymentFailure);

// Signed asset retrieval (For Linux CUPS or Windows agents)
router.get('/documents/stream-by-token', streamByToken);

// Services List (Publicly readable to compute client estimations)
router.get('/services', getServices);


// ==========================================
// STAFF ROUTES (JWT AUTH REQUIRED)
// ==========================================

// Orders Management
router.get('/orders', authenticateStaff, listOrders);
router.get('/orders/:id', authenticateStaff, getOrderDetails);
router.patch('/orders/:id/status', authenticateStaff, updateOrderStatus);

// Services CRUD
router.post('/services', authenticateStaff, createService);
router.put('/services/:id', authenticateStaff, updateService);
router.delete('/services/:id', authenticateStaff, deleteService);

// Dashboard Statistics & Analytics
router.get('/dashboard/stats', authenticateStaff, getDashboardStats);

// Staff Directory & Management
router.get('/dashboard/staff', authenticateStaff, getStaffMembers);
router.post('/dashboard/staff', authenticateStaff, requireOwner, addStaffMember);
router.delete('/dashboard/staff/:id', authenticateStaff, requireOwner, deleteStaffMember);

// Secured direct streaming and token signing
router.get('/documents/secure-stream/:id', authenticateStaff, secureStreamDocument);
router.get('/documents/signed-token/:id', authenticateStaff, getSignedFileToken);

export default router;
