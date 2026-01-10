import { Menu, Home, FileText, CreditCard, DollarSign, BarChart3, Settings, HelpCircle, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import logoWordmark from "@/assets/logo-wordmark-sea-green.svg";
import logoMonogram from "@/assets/logo-monogram-sea-green.svg";

const CustomerHeader = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const menuItems = [
    { icon: Home, label: "Home", path: "/" },
    { icon: CreditCard, label: "Monthly Statements", path: "/monthly-statements" },
    { icon: FileText, label: "Agreement of Sale", path: "/agreement-of-sale" },
    { icon: BarChart3, label: "Reporting", path: "/reporting" },
    { icon: UserCog, label: "Account Management", path: "/account-management" },
    { icon: Settings, label: "Settings", path: "/settings" },
    { icon: HelpCircle, label: "Guide", path: "/guide" },
  ];

  const handleNavigation = (path: string) => {
    navigate(path);
    setOpen(false);
  };

  return (
    <header className="sticky top-0 z-50 w-full bg-card border-b border-border px-3 py-2.5">
      <div className="flex items-center justify-between max-w-md mx-auto">
        <div className="flex items-center gap-2">
          {/* Wordmark for desktop, Monogram for mobile */}
          <img 
            src={logoWordmark} 
            alt="LakeCity" 
            className="hidden sm:block h-8 w-auto"
          />
          <img 
            src={logoMonogram} 
            alt="LakeCity" 
            className="sm:hidden h-8 w-8"
          />
        </div>
        
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Menu className="h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[280px]">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <img src={logoMonogram} alt="LakeCity" className="h-6 w-6" />
                <span>LakeCity</span>
              </SheetTitle>
            </SheetHeader>
            <nav className="flex flex-col gap-2 mt-6">
              {menuItems.map((item) => (
                <Button
                  key={item.path}
                  variant="ghost"
                  className="w-full justify-start gap-3 text-base"
                  onClick={() => handleNavigation(item.path)}
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </Button>
              ))}
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
};

export default CustomerHeader;
