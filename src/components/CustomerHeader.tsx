import { useState, useEffect } from "react";
import { Menu, Home, FileText, CreditCard, Settings, HelpCircle, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import logoWordmark from "@/assets/logo-wordmark-sea-green.svg";
import logoMonogram from "@/assets/logo-monogram-sea-green.svg";
import LogoutConfirmDialog from "@/components/LogoutConfirmDialog";

const CustomerHeader = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [userInitials, setUserInitials] = useState("LC");
  const [logoutLoading, setLogoutLoading] = useState(false);

  useEffect(() => {
    loadUserInitials();
  }, []);

  const loadUserInitials = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) return;

      // Try to get full name from profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle();

      if (profile?.full_name) {
        const nameParts = profile.full_name.trim().split(' ').filter(Boolean);
        if (nameParts.length >= 2) {
          setUserInitials(`${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase());
        } else if (nameParts.length === 1) {
          setUserInitials(nameParts[0].substring(0, 2).toUpperCase());
        }
      }
    } catch (error) {
      // Keep default initials
    }
  };

  const handleLogout = async () => {
    setLogoutLoading(true);
    try {
      await supabase.auth.signOut();
      navigate("/login");
    } catch (error: any) {
      console.error("Logout failed");
    } finally {
      setLogoutLoading(false);
      setOpen(false);
    }
  };

  // Customer-only menu items - removed Reporting and Account Management
  const menuItems = [
    { icon: Home, label: "Home", path: "/" },
    { icon: CreditCard, label: "Monthly Statements", path: "/monthly-statements" },
    { icon: FileText, label: "Agreement of Sale", path: "/agreement-of-sale" },
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
          {/* User initials avatar */}
          <Avatar className="h-8 w-8 bg-primary">
            <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
              {userInitials}
            </AvatarFallback>
          </Avatar>
          
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
              
              {/* Separator */}
              <div className="h-px bg-border my-2" />
              
              {/* Logout button with confirmation */}
              <LogoutConfirmDialog 
                onConfirm={handleLogout} 
                loading={logoutLoading}
                triggerClassName="w-full justify-start gap-3 text-base text-destructive hover:text-destructive hover:bg-destructive/10"
              />
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
};

export default CustomerHeader;
