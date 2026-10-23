import { useState } from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { CollectionProvider } from "./context/CollectionContext";
import { ToastProvider } from "./context/ToastContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import Header from "./components/Header";
import LoginModal from "./components/LoginModal";
import RegisterModal from "./components/RegisterModal";
import HomePage from "./pages/HomePage";
import PublishPage from "./pages/PublishPage";
import ProfilePage from "./pages/ProfilePage";

function AppContent() {
  const [search, setSearch] = useState("");
  const [activeNav, setActiveNav] = useState("推荐");

  return (
    <div className="min-h-screen bg-[#f8f8f8] font-sans">
      <Header
        search={search}
        onSearchChange={setSearch}
        activeNav={activeNav}
        onNavChange={setActiveNav}
      />

      <Routes>
        <Route path="/" element={
          <HomePage
            search={search}
            onSearchChange={setSearch}
            activeNav={activeNav}
            onNavChange={setActiveNav}
          />
        } />
        <Route path="/publish" element={<PublishPage />} />
        <Route path="/profile" element={<ProfilePage />} />
      </Routes>

      <LoginModal />
      <RegisterModal />

      <style>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }

        @keyframes fade-in {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in { animation: fade-in 0.2s ease both; }

        @keyframes modal-in {
          from { opacity: 0; transform: scale(0.94) translateY(16px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .animate-modal-in { animation: modal-in 0.3s cubic-bezier(0.34,1.2,0.64,1) both; }

        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .break-inside-avoid { break-inside: avoid; }
      `}</style>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <HashRouter>
        <ToastProvider>
          <AuthProvider>
            <CollectionProvider>
              <AppContent />
            </CollectionProvider>
          </AuthProvider>
        </ToastProvider>
      </HashRouter>
    </ErrorBoundary>
  );
}
