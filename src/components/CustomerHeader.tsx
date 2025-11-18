import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";

const CustomerHeader = () => {
  return (
    <header className="sticky top-0 z-50 w-full bg-card border-b border-border px-4 py-3">
      <div className="flex items-center justify-between max-w-md mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">LC</span>
          </div>
          <h1 className="text-lg font-semibold text-foreground">Customer Portal</h1>
        </div>
        <Button variant="ghost" size="icon">
          <Menu className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
};

export default CustomerHeader;
