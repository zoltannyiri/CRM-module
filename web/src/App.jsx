import { BrowserRouter, Route, Routes } from "react-router-dom";

import LoginPage from "./pages/LoginPage.jsx";
import RegisterPage from "./pages/RegisterPage.jsx";
import Sidebar from "./components/Sidebar.jsx";

function App() {

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/register/:token" element={<RegisterPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<div className="flex min-h-dvh bg-[#f6f8f9]"><Sidebar /><main className="min-w-0 flex-1" aria-label="Munkaterület" /></div>} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
