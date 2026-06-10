#!/bin/bash

# Exit on error
set -e

echo "=========================================================="
echo "⚡ CYBER CAFÉ AUTOMATED MANAGEMENT SYSTEM INITIALIZER 🚀"
echo "=========================================================="

# 1. Start Postgresql if it is not online
echo "1. Ensuring PostgreSQL Database Cluster is Online..."
if pg_lsclusters | grep -q "17" && pg_lsclusters | grep "17" | grep -q "online"; then
  echo "✔ PostgreSQL is already online."
else
  echo "⚙ Starting PostgreSQL cluster..."
  sudo pg_ctlcluster 17 main start
  echo "✔ PostgreSQL successfully started."
fi

# 2. Start Express Backend
echo "2. Starting Express REST API Backend..."
cd backend
npm run build
npm run start > backend.log 2>&1 &
BACKEND_PID=$!
echo "✔ Express started in background with PID: $BACKEND_PID"
cd ..

# 3. Start React Frontend
echo "3. Starting React (Vite) Frontend..."
cd frontend
npm run build
npm run preview -- --port 3000 --host > frontend.log 2>&1 &
FRONTEND_PID=$!
echo "✔ React static server preview started in background with PID: $FRONTEND_PID"
cd ..

echo "=========================================================="
echo "🎯 ALL SYSTEMS INITIALIZED SUCCESSFULLY!"
echo "=========================================================="
echo "🏥 Backend URL : http://localhost:5000"
echo "🖥 Customer/Attendant Portals: http://localhost:3000"
echo "📄 Logs saved in backend/backend.log and frontend/frontend.log"
echo "=========================================================="
echo "Press Ctrl+C to stop all servers."

# Keep running and trap exits
trap "kill $BACKEND_PID $FRONTEND_PID; exit" INT TERM
wait
