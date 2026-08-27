import { BrowserRouter, Route, Routes } from "react-router-dom";
import './App.css'

function App() {

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/register" element={<div>Register</div>} />
        <Route path="/login" element={<div>Login</div>} />
        <Route path="/" element={<div>Home</div>} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
