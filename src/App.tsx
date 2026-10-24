import { useState, useEffect } from "react";
import { HashRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
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
import PostDetailPage from "./pages/PostDetailPage";
import TagPage from "./pages/TagPage";
import BoardPage from "./pages/BoardPage";
import AlbumPage from "./pages/AlbumPage";
import DiscoverPage from "./pages/DiscoverPage";
import { SEARCH_EVENT } from "./utils/searchEvent";

function AppContent() {
  const [search, setSearch] = useState("");
  const [activeNav, setActiveNav] = useState("推荐");
  const navigate = useNavigate();

  // 评论里的 @ 提及点击后：回到首页并填入搜索框
  useEffect(() => {
    const handler = (e: Event) => {
      const query = (e as CustomEvent<{ query: string }>).detail?.query;
      if (query) {
        setSearch(query);
        navigate("/");
      }
    };
    window.addEventListener(SEARCH_EVENT, handler);
    return () => window.removeEventListener(SEARCH_EVENT, handler);
  }, [navigate]);

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
        <Route path="/pin/:id" element={<PostDetailPage />} />
        <Route path="/tag/:tag" element={<TagPage />} />
        <Route path="/board/:key" element={<BoardPage />} />
        <Route path="/album/:id" element={<AlbumPage />} />
        <Route path="/discover" element={<DiscoverPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <LoginModal />
      <RegisterModal />
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
