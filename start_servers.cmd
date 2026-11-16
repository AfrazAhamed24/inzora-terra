@echo off
title Inzora Terra OS - Multi-Agent Disaster Response
cd /d C:\Users\afraz ahamed k m\Downloads\project catalyst\backend
echo Starting Backend API Server on port 8000...
python -m backend.api.main
cd /d C:\Users\afraz ahamed k m\Downloads\project catalyst\frontend
echo Starting Frontend Dev Server on port 5173...
npx vite --host --port 5173