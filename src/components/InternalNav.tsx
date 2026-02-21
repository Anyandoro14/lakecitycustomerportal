import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Home, 
  TrendingUp, 
  Users, 
  Eye, 
  Menu,
  Shield,
  ChevronDown,
  Newspaper,
  MessageSquare,
} from "lucide-react";

interface InternalNavProps {
  isSuperAdmin?: boolean;
  isDirector?: boolean;
  currentPage?: string;
}

const InternalNav = ({ isSuperAdmin = false, isDirector = false, currentPage }: InternalNavProps) => {
  const navigate = useNavigate();
  const location = useLocation();

  // Determine current page from route if not provided
  const activePage = currentPage || (() => {
    if (location.pathname.includes('reporting')) return 'reporting';
    if (location.pathname.includes('account-management')) return 'access';
    if (location.pathname.includes('looking-glass')) return 'looking-glass';
    if (location.pathname.includes('internal-portal')) return 'portal';
    return '';
  })();

  // Define navigation items based on permissions
  const navItems = [
    {
      id: 'portal',
      label: 'Internal Portal',
      icon: Shield,
      path: '/internal-portal',
      visible: true, // All internal users can access
    },
    {
      id: 'reporting',
      label: 'Reporting',
      icon: TrendingUp,
      path: '/reporting',
      visible: isSuperAdmin || isDirector, // Only Super Admin and Director
    },
    {
      id: 'articles',
      label: 'Articles',
      icon: Newspaper,
      path: '/updates',
      visible: true, // All internal users
    },
    {
      id: 'feedback',
      label: 'Feedback',
      icon: MessageSquare,
      path: '/article-feedback',
      visible: true, // All internal users
    },
  ];

  const visibleItems = navItems.filter(item => item.visible);

  return (
    <div className="flex items-center gap-2">
      {/* Home button (far left on desktop) */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => navigate("/")}
        className="hidden md:flex bg-white text-primary border-white/80 hover:bg-white/90 font-semibold"
      >
        <Home className="h-4 w-4 mr-2" />
        Home
      </Button>

      {/* Desktop Navigation */}
      <div className="hidden md:flex items-center gap-2">
        {visibleItems.map((item) => (
          <Button
            key={item.id}
            variant={activePage === item.id ? "secondary" : "ghost"}
            size="sm"
            onClick={() => navigate(item.path)}
            className={`${
              activePage === item.id 
                ? "bg-primary-foreground/20 text-primary-foreground" 
                : "text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10"
            }`}
          >
            <item.icon className="h-4 w-4 mr-2" />
            {item.label}
          </Button>
        ))}
      </div>

      {/* Mobile Dropdown Navigation */}
      <div className="md:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="ghost" 
              size="sm"
              className="text-primary-foreground hover:bg-primary-foreground/10"
            >
              <Menu className="h-4 w-4 mr-2" />
              Menu
              <ChevronDown className="h-4 w-4 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {visibleItems.map((item, index) => (
              <DropdownMenuItem
                key={item.id}
                onClick={() => navigate(item.path)}
                className={activePage === item.id ? "bg-muted" : ""}
              >
                <item.icon className="h-4 w-4 mr-2" />
                {item.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/")}>
              <Home className="h-4 w-4 mr-2" />
              Customer Home
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

export default InternalNav;
