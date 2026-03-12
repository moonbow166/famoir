import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ScrollToTop } from "./components/ScrollToTop";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";

import Index from "./pages/Index";
import LoginPage from "./pages/Login";
import SetupPage from "./pages/Setup";
import SessionPage from "./pages/Session";
import GeneratingPage from "./pages/Generating";
import MemoirPage from "./pages/Memoir";
import DashboardPage from "./pages/Dashboard";
import BookPreviewPage from "./pages/BookPreview";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <ScrollToTop />
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<LoginPage />} />

            {/* Protected routes — require authentication */}
            <Route path="/setup" element={<ProtectedRoute><SetupPage /></ProtectedRoute>} />
            <Route path="/session" element={<ProtectedRoute><SessionPage /></ProtectedRoute>} />
            <Route path="/generating" element={<ProtectedRoute><GeneratingPage /></ProtectedRoute>} />
            <Route path="/memoir" element={<ProtectedRoute><MemoirPage /></ProtectedRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
            <Route path="/book-preview" element={<ProtectedRoute><BookPreviewPage /></ProtectedRoute>} />

            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
