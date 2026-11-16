Set WshShell = CreateObject("WScript.Shell")
' Start backend
WshShell.Run "python -m backend.api.main", 0, False
WScript.Sleep 2000
' Start frontend
WshShell.Run "cmd /c cd C:\Users\afraz ahamed k m\Downloads\project catalyst\frontend && npx vite", 0, False