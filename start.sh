#!/bin/bash
echo "Starting AI Agent System..."

# Clean old logs
> backend.log
> frontend.log

echo "Starting Backend on port 8000..."
cd backend
source venv/bin/activate
uvicorn main:app --reload --port 8000 > ../backend.log 2>&1 &
BACKEND_PID=$!

echo "Starting Frontend on port 3000..."
cd ../frontend
npm run dev > ../frontend.log 2>&1 &
FRONTEND_PID=$!

trap "echo 'Stopping servers...'; kill $BACKEND_PID $FRONTEND_PID; exit" SIGINT SIGTERM

echo "Both servers are running."
echo "----------------------------------------"
echo "- Backend logged to -> backend.log"
echo "- Frontend logged to -> frontend.log"
echo "----------------------------------------"
echo "Press Ctrl+C to stop both servers."
wait
