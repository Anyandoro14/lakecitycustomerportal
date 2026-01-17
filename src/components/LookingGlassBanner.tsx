import { useLookingGlass } from "@/contexts/LookingGlassContext";
import { Button } from "@/components/ui/button";
import { Eye, X, Clock, User, MapPin } from "lucide-react";
import { useEffect, useState } from "react";

const LookingGlassBanner = () => {
  const { isLookingGlassMode, customer, exitLookingGlass, sessionStartTime } = useLookingGlass();
  const [elapsedTime, setElapsedTime] = useState("0:00");

  useEffect(() => {
    if (!isLookingGlassMode || !sessionStartTime) return;

    const interval = setInterval(() => {
      const elapsed = Math.floor((new Date().getTime() - sessionStartTime.getTime()) / 1000);
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      setElapsedTime(`${minutes}:${seconds.toString().padStart(2, '0')}`);
    }, 1000);

    return () => clearInterval(interval);
  }, [isLookingGlassMode, sessionStartTime]);

  if (!isLookingGlassMode || !customer) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 py-2">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {/* Left side - Mode indicator */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-white/20 rounded-full px-3 py-1">
              <Eye className="h-4 w-4" />
              <span className="text-sm font-semibold">LOOKING GLASS</span>
            </div>
            <span className="text-sm">Read-Only Customer View</span>
          </div>

          {/* Center - Customer info */}
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" />
              <span className="font-medium">{customer.customerName}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              <span>Stand {customer.standNumber}</span>
            </div>
            <div className="flex items-center gap-1.5 bg-white/20 rounded px-2 py-0.5">
              <Clock className="h-3.5 w-3.5" />
              <span className="font-mono text-xs">{elapsedTime}</span>
            </div>
          </div>

          {/* Right side - Exit button */}
          <Button
            variant="secondary"
            size="sm"
            onClick={exitLookingGlass}
            className="bg-white text-orange-600 hover:bg-white/90 font-semibold"
          >
            <X className="h-4 w-4 mr-1" />
            Exit Looking Glass
          </Button>
        </div>
      </div>
    </div>
  );
};

export default LookingGlassBanner;
