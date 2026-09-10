import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import LoginPage from "./pages/LoginPage.jsx";
import RegisterPage from "./pages/RegisterPage.jsx";
import Sidebar from "./components/Sidebar.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import ContactPage from "./pages/ContactPage.jsx";
import PartnerPage from "./pages/PartnerPage.jsx";
import ProjectPage from "./pages/ProjectPage.jsx";
import TaskPage from "./pages/TaskPage.jsx";
import ActivityPage from "./pages/ActivityPage.jsx";
import ModuleRoute from "./components/ModuleRoute.jsx";
import PermissionRoute from "./components/PermissionRoute.jsx";
import SettingsPermissionsPage from "./pages/SettingsPermissionsPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";

function Workspace({ children }) {
  return (
    <ProtectedRoute>
      <div className="flex min-h-dvh bg-[#f6f8f9]">
        <Sidebar />
        <main className="min-w-0 flex-1" aria-label="Munkaterület">{children}</main>
      </div>
    </ProtectedRoute>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/register/:token" element={<RegisterPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/partner"
          element={
            <Workspace><ModuleRoute module="PARTNERS"><PermissionRoute permission="PARTNERS_VIEW"><PartnerPage /></PermissionRoute></ModuleRoute></Workspace>
          }
        />
        <Route
          path="/partner/:id"
          element={
            <Workspace><ModuleRoute module="PARTNERS"><PermissionRoute permission="PARTNERS_VIEW"><PartnerPage /></PermissionRoute></ModuleRoute></Workspace>
          }
        />
        <Route
          path="/contact"
          element={
            <Workspace><ModuleRoute module="PARTNERS"><PermissionRoute permission="PARTNERS_VIEW"><ContactPage /></PermissionRoute></ModuleRoute></Workspace>
          }
        />
        <Route
          path="/contact/:id"
          element={
            <Workspace><ModuleRoute module="PARTNERS"><PermissionRoute permission="PARTNERS_VIEW"><ContactPage /></PermissionRoute></ModuleRoute></Workspace>
          }
        />
        <Route
          path="/project"
          element={
            <Workspace><ModuleRoute module="PROJECTS"><PermissionRoute permission="PROJECTS_VIEW"><ProjectPage /></PermissionRoute></ModuleRoute></Workspace>
          }
        />
        <Route
          path="/project/:id"
          element={
            <Workspace><ModuleRoute module="PROJECTS"><PermissionRoute permission="PROJECTS_VIEW"><ProjectPage /></PermissionRoute></ModuleRoute></Workspace>
          }
        />
        <Route
          path="/task"
          element={
            <Workspace><ModuleRoute module="TASKS"><PermissionRoute permission="TASKS_VIEW"><TaskPage /></PermissionRoute></ModuleRoute></Workspace>
          }
        />
        <Route
          path="/activity"
          element={
            <Workspace><PermissionRoute permission="ACTIVITY_VIEW"><ActivityPage /></PermissionRoute></Workspace>
          }
        />
        <Route path="/settings/permissions" element={<Workspace><SettingsPermissionsPage /></Workspace>} />
        <Route path="/dashboard" element={<Workspace><DashboardPage /></Workspace>} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
