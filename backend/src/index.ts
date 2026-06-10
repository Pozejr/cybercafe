import express from 'express';
import http from 'http';
import { Server as SocketServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import apiRouter from './routes/api';
import { errorHandler } from './middleware/errorMiddleware';
import { initDb } from './config/initDb';
import { MpesaService } from './services/mpesa';
import { PrintService } from './services/printService';

// Load environment variables
dotenv.config();

const app = express();
const server = http.createServer(app);

// Configure Socket.io
const io = new SocketServer(server, {
  cors: {
    origin: '*', // In production, restrict to your specific domain
    methods: ['GET', 'POST'],
  },
});

// Pass Socket.io server to services
MpesaService.setSocketServer(io);
PrintService.setSocketServer(io);

// Setup standard production middleware
app.use(helmet({
  crossOriginResourcePolicy: false, // Allows displaying images or PDFs in browser frames
}));

app.use(cors({
  origin: '*', // In production, replace with specific domain
  credentials: true,
}));

app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve API Routes
app.use('/api', apiRouter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date() });
});

// Global error handler
app.use(errorHandler);

// Socket.io connections
io.on('connection', (socket) => {
  console.log(`[SOCKET CONNECTED] Client ID: ${socket.id}`);
  
  // Send current print queue upon connection (staff only or agent)
  socket.emit('print_queue_current', PrintService.getQueue());

  socket.on('join_dashboard', () => {
    socket.join('dashboard');
    console.log(`[SOCKET] Client joined dashboard room: ${socket.id}`);
  });

  socket.on('disconnect', () => {
    console.log(`[SOCKET DISCONNECTED] Client ID: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    // 1. Initialize and seed database tables
    await initDb();

    // 2. Listen on port
    server.listen(PORT, () => {
      console.log(`====================================================`);
      console.log(`🚀 Cyber Café System Backend running on port ${PORT}`);
      console.log(`🏥 Health Check: http://localhost:${PORT}/health`);
      console.log(`====================================================`);
    });
  } catch (error) {
    console.error('CRITICAL: Server failed to start due to database errors:', error);
    process.exit(1);
  }
}

startServer();
