import { BrowserRouter, Route, Routes } from "react-router-dom";
import './App.css'

import LoginPage from "./pages/LoginPage.jsx";
import RegisterPage from "./pages/RegisterPage.jsx";

function App() {

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/register/:token" element={<RegisterPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<div>Home</div>} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
