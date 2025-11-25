import { Home, CreditCard, FileText, User, HelpCircle } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";

const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border safe-area-inset-bottom">
      <div className="flex justify-around items-center max-w-md mx-auto px-2 py-2.5">
        <button 
          onClick={() => navigate("/")}
          className={`flex flex-col items-center gap-1 ${location.pathname === "/" ? "text-primary" : "text-muted-foreground"}`}
        >
          <Home className="h-5 w-5" />
          <span className="text-xs font-medium">Home</span>
        </button>
        <button 
          onClick={() => navigate("/monthly-statements")}
          className={`flex flex-col items-center gap-1 ${location.pathname === "/monthly-statements" ? "text-primary" : "text-muted-foreground"}`}
        >
          <CreditCard className="h-5 w-5" />
          <span className="text-xs">Payments</span>
        </button>
        <button 
          onClick={() => navigate("/agreement-of-sale")}
          className={`flex flex-col items-center gap-1 ${location.pathname === "/agreement-of-sale" ? "text-primary" : "text-muted-foreground"}`}
        >
          <FileText className="h-5 w-5" />
          <span className="text-xs">Documents</span>
        </button>
        <button 
          onClick={() => navigate("/settings")}
          className={`flex flex-col items-center gap-1 ${location.pathname === "/settings" ? "text-primary" : "text-muted-foreground"}`}
        >
          <User className="h-5 w-5" />
          <span className="text-xs">Settings</span>
        </button>
        <button 
          onClick={() => navigate("/guide")}
          className={`flex flex-col items-center gap-1 ${location.pathname === "/guide" ? "text-primary" : "text-muted-foreground"}`}
        >
          <HelpCircle className="h-5 w-5" />
          <span className="text-xs">Guide</span>
        </button>
      </div>
    </nav>
  );
};

export default BottomNav;
