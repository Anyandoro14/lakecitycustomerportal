import { Home, CreditCard, FileText, User, HelpCircle } from "lucide-react";

const BottomNav = () => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border">
      <div className="flex justify-around items-center max-w-md mx-auto px-4 py-3">
        <button className="flex flex-col items-center gap-1 text-primary">
          <Home className="h-5 w-5" />
          <span className="text-xs font-medium">Home</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-muted-foreground">
          <CreditCard className="h-5 w-5" />
          <span className="text-xs">Payments</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-muted-foreground">
          <FileText className="h-5 w-5" />
          <span className="text-xs">Documents</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-muted-foreground">
          <User className="h-5 w-5" />
          <span className="text-xs">Profile</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-muted-foreground">
          <HelpCircle className="h-5 w-5" />
          <span className="text-xs">Support</span>
        </button>
      </div>
    </nav>
  );
};

export default BottomNav;
