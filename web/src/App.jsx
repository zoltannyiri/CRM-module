import { BrowserRouter, Route, Routes } from "react-router-dom";

import LoginPage from "./pages/LoginPage.jsx";
import RegisterPage from "./pages/RegisterPage.jsx";
import Sidebar from "./components/Sidebar.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import ContactPage from "./pages/ContactPage.jsx";
import PartnerPage from "./pages/PartnerPage.jsx";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/register/:token" element={<RegisterPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/partner"
          element={
            <ProtectedRoute>
              <div className="flex min-h-dvh bg-[#f6f8f9]">
                <Sidebar />
                <main className="min-w-0 flex-1" aria-label="Munkaterület">
                  <PartnerPage />
                </main>
              </div>
            </ProtectedRoute>
          }
        />
        <Route
          path="/partner/:id"
          element={
            <ProtectedRoute>
              <div className="flex min-h-dvh bg-[#f6f8f9]">
                <Sidebar />
                <main className="min-w-0 flex-1" aria-label="Munkaterület">
                  <PartnerPage />
                </main>
              </div>
            </ProtectedRoute>
          }
        />
        <Route
          path="/contact"
          element={
            <ProtectedRoute>
              <div className="flex min-h-dvh bg-[#f6f8f9]">
                <Sidebar />
                <main className="min-w-0 flex-1" aria-label="Munkaterület">
                  <ContactPage />
                </main>
              </div>
            </ProtectedRoute>
          }
        />
        <Route
          path="/contact/:id"
          element={
            <ProtectedRoute>
              <div className="flex min-h-dvh bg-[#f6f8f9]">
                <Sidebar />
                <main className="min-w-0 flex-1" aria-label="Munkaterület">
                  <ContactPage />
                </main>
              </div>
            </ProtectedRoute>
          }
        />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <div className="flex min-h-dvh bg-[#f6f8f9]">
                <Sidebar />
                <main className="min-w-0 flex-1" aria-label="Munkaterület" />
              </div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
