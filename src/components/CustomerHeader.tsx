import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";

const CustomerHeader = () => {
  return (
    <header className="sticky top-0 z-50 w-full bg-card border-b border-border px-3 py-2.5">
      <div className="flex items-center justify-between max-w-md mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-xs">LC</span>
          </div>
          <h1 className="text-base font-semibold text-foreground">Customer Portal</h1>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Menu className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
};

export default CustomerHeader;
