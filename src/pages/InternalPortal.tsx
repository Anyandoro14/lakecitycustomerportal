import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2,
  Search,
  Shield,
  Users,
  History,
  Key,
  MessageSquare,
  BookOpen,
  ChevronRight,
  Phone,
  Mail,
  MapPin,
  AlertTriangle,
  CheckCircle,
  Clock,
  Send,
  RefreshCw,
  FileText,
  Home,
  LogOut,
} from "lucide-react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface InternalUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_override_approver: boolean;
}

interface AuditEntry {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  performed_by_email: string;
  details: Record<string, any>;
  created_at: string;
}

interface CustomerInfo {
  stand_number: string;
  full_name: string;
  email: string;
  phone_number: string;
  payment_start_date: string;
  user_id: string;
}

interface KnowledgeArticle {
  id: string;
  title: string;
  category: string;
  content: string;
  tags: string[];
}

const InternalPortal = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [isInternalUser, setIsInternalUser] = useState(false);
  const [currentUser, setCurrentUser] = useState<InternalUser | null>(null);
  const [activeTab, setActiveTab] = useState("dashboard");

  // Search states
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState<"stand" | "phone">("stand");
  const [searchResults, setSearchResults] = useState<CustomerInfo[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerInfo | null>(null);

  // Audit log states
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // Password reset states
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  // Messaging states
  const [messageRecipient, setMessageRecipient] = useState("");
  const [messageContent, setMessageContent] = useState("");
  const [messageType, setMessageType] = useState<"sms" | "whatsapp">("whatsapp");
  const [sendingMessage, setSendingMessage] = useState(false);

  // Knowledge base states
  const [knowledgeArticles, setKnowledgeArticles] = useState<KnowledgeArticle[]>([]);
  const [selectedArticle, setSelectedArticle] = useState<KnowledgeArticle | null>(null);

  useEffect(() => {
    checkAccess();
  }, []);

  const checkAccess = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast.error("Please sign in with your @lakecity.co.zw account");
        navigate("/internal-login");
        return;
      }

      const userEmail = session.user.email?.toLowerCase() || "";
      if (!userEmail.endsWith("@lakecity.co.zw")) {
        toast.error("Access restricted to LakeCity staff only");
        await supabase.auth.signOut();
        navigate("/internal-login");
        return;
      }

      // Check if user exists in internal_users table
      const { data, error } = await supabase.functions.invoke('internal-portal-access', {
        body: { action: 'check-access' }
      });

      if (error || !data?.isInternal) {
        toast.error("You don't have internal portal access. Contact an administrator.");
        navigate("/internal-login");
        return;
      }

      setCurrentUser(data.user);
      setIsInternalUser(true);
      
      // Load initial data
      loadAuditLogs();
      loadKnowledgeBase();
    } catch (error: any) {
      console.error('Access check error:', error);
      toast.error("Failed to verify access");
      navigate("/internal-login");
    } finally {
      setLoading(false);
    }
  };

  const loadAuditLogs = async () => {
    setAuditLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('internal-portal-access', {
        body: { action: 'get-audit-logs', days: 30 }
      });
      if (data?.logs) setAuditLogs(data.logs);
    } catch (error) {
      console.error('Failed to load audit logs:', error);
    } finally {
      setAuditLoading(false);
    }
  };

  const loadKnowledgeBase = async () => {
    // Static knowledge base for now - can be expanded with DB later
    setKnowledgeArticles([
      {
        id: "1",
        title: "How to Process a Payment Receipt",
        category: "Payments",
        content: `## Payment Receipt Processing\n\n1. Go to the Receipts_Intake tab in Google Sheets\n2. Verify the stand number matches the customer\n3. Check the amount matches bank confirmation\n4. Set Column K to "Approved" to trigger posting\n5. The system will automatically post to Collection Schedule\n\n**Important**: Always verify bank reference before approving.`,
        tags: ["payments", "receipts", "approval"]
      },
      {
        id: "2",
        title: "Password Reset Procedure",
        category: "Account Support",
        content: `## Customer Password Reset\n\n1. Verify customer identity (stand number + phone)\n2. Use the Password Reset tab in this portal\n3. Enter customer email and click Reset\n4. Customer will receive SMS with new temporary password\n5. Log the action in audit trail\n\n**Security**: Always verify identity before resetting.`,
        tags: ["password", "reset", "security"]
      },
      {
        id: "3",
        title: "Stand Number Lookup",
        category: "Customer Service",
        content: `## Finding Customer Information\n\n1. Use Transaction Lookup tab\n2. Search by Stand Number or Phone Number\n3. View payment history and account status\n4. Check for overdue payments\n\n**Privacy**: Only access information when needed for support.`,
        tags: ["lookup", "customer", "stand"]
      },
      {
        id: "4",
        title: "Sending WhatsApp Messages",
        category: "Communication",
        content: `## WhatsApp Messaging Guidelines\n\n1. Only send messages for official business\n2. Use professional, courteous language\n3. Include case reference when applicable\n4. Do not share sensitive information via WhatsApp\n5. Log all communications\n\n**Templates**: Use approved message templates when possible.`,
        tags: ["whatsapp", "messaging", "communication"]
      },
      {
        id: "5",
        title: "Override Request Process",
        category: "Approvals",
        content: `## Requesting an Override\n\nOverrides require approval from:\n- Alex\n- Brenda\n- Tapiwa\n\n**Process**:\n1. Document the reason for override\n2. Get verbal approval from approver\n3. Log in system with approver name\n4. Proceed with action\n\n**Audit**: All overrides are logged and reviewed.`,
        tags: ["override", "approval", "process"]
      }
    ]);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      toast.error("Please enter a search term");
      return;
    }

    setSearchLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('internal-portal-access', {
        body: { 
          action: 'search-customer',
          searchType,
          searchQuery: searchQuery.trim()
        }
      });

      if (error) throw error;

      setSearchResults(data?.customers || []);
      if (data?.customers?.length === 0) {
        toast.info("No customers found matching your search");
      }
    } catch (error: any) {
      console.error('Search error:', error);
      toast.error("Search failed");
    } finally {
      setSearchLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!resetEmail.trim() || !newPassword.trim()) {
      toast.error("Please enter email and new password");
      return;
    }

    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    setResetLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-reset-password', {
        body: { email: resetEmail, newPassword }
      });

      if (error) throw error;

      toast.success(`Password reset for ${resetEmail}`);
      setShowResetDialog(false);
      setResetEmail("");
      setNewPassword("");
      loadAuditLogs();
    } catch (error: any) {
      console.error('Password reset error:', error);
      toast.error(error.message || "Failed to reset password");
    } finally {
      setResetLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!messageRecipient.trim() || !messageContent.trim()) {
      toast.error("Please enter recipient and message");
      return;
    }

    setSendingMessage(true);
    try {
      const { data, error } = await supabase.functions.invoke('internal-send-message', {
        body: {
          recipient: messageRecipient,
          message: messageContent,
          type: messageType
        }
      });

      if (error) throw error;

      toast.success(`${messageType === 'whatsapp' ? 'WhatsApp' : 'SMS'} sent successfully`);
      setMessageContent("");
      loadAuditLogs();
    } catch (error: any) {
      console.error('Send message error:', error);
      toast.error(error.message || "Failed to send message");
    } finally {
      setSendingMessage(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/internal-login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Verifying access...</p>
        </div>
      </div>
    );
  }

  if (!isInternalUser) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-primary text-primary-foreground sticky top-0 z-50 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Shield className="h-6 w-6" />
            <div>
              <h1 className="text-lg font-bold">LakeCity Internal Portal</h1>
              <p className="text-xs text-primary-foreground/70">Helpdesk & Admin</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium">{currentUser?.full_name || currentUser?.email}</p>
              <Badge variant="secondary" className="text-xs">
                {currentUser?.role}
                {currentUser?.is_override_approver && " • Approver"}
              </Badge>
            </div>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="text-primary-foreground">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-4 md:p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid grid-cols-2 md:grid-cols-5 gap-2 h-auto p-1">
            <TabsTrigger value="dashboard" className="flex items-center gap-2 py-2">
              <Home className="h-4 w-4" />
              <span className="hidden md:inline">Dashboard</span>
            </TabsTrigger>
            <TabsTrigger value="lookup" className="flex items-center gap-2 py-2">
              <Search className="h-4 w-4" />
              <span className="hidden md:inline">Lookup</span>
            </TabsTrigger>
            <TabsTrigger value="password" className="flex items-center gap-2 py-2">
              <Key className="h-4 w-4" />
              <span className="hidden md:inline">Password</span>
            </TabsTrigger>
            <TabsTrigger value="messaging" className="flex items-center gap-2 py-2">
              <MessageSquare className="h-4 w-4" />
              <span className="hidden md:inline">Messaging</span>
            </TabsTrigger>
            <TabsTrigger value="knowledge" className="flex items-center gap-2 py-2">
              <BookOpen className="h-4 w-4" />
              <span className="hidden md:inline">Knowledge</span>
            </TabsTrigger>
          </TabsList>

          {/* Dashboard Tab */}
          <TabsContent value="dashboard" className="space-y-6">
            {/* Process Flow */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Helpdesk Process Flow
                </CardTitle>
                <CardDescription>Quick reference for handling customer requests</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="p-4 bg-muted rounded-lg">
                    <h3 className="font-semibold mb-2 flex items-center gap-2">
                      <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-sm">1</span>
                      Identify
                    </h3>
                    <ul className="text-sm space-y-1 text-muted-foreground">
                      <li>• Verify caller identity</li>
                      <li>• Get stand number</li>
                      <li>• Confirm phone/email</li>
                    </ul>
                  </div>
                  <div className="p-4 bg-muted rounded-lg">
                    <h3 className="font-semibold mb-2 flex items-center gap-2">
                      <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-sm">2</span>
                      Investigate
                    </h3>
                    <ul className="text-sm space-y-1 text-muted-foreground">
                      <li>• Search customer record</li>
                      <li>• Review payment history</li>
                      <li>• Check audit trail</li>
                    </ul>
                  </div>
                  <div className="p-4 bg-muted rounded-lg">
                    <h3 className="font-semibold mb-2 flex items-center gap-2">
                      <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-sm">3</span>
                      Resolve
                    </h3>
                    <ul className="text-sm space-y-1 text-muted-foreground">
                      <li>• Take appropriate action</li>
                      <li>• Get override if needed</li>
                      <li>• Confirm resolution</li>
                    </ul>
                  </div>
                </div>

                <Separator className="my-6" />

                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="font-semibold mb-3 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-600" />
                      Override Required For
                    </h3>
                    <ul className="text-sm space-y-2">
                      <li className="flex items-center gap-2">
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        Manual balance adjustments
                      </li>
                      <li className="flex items-center gap-2">
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        Backdated payment posting
                      </li>
                      <li className="flex items-center gap-2">
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        Account status changes
                      </li>
                      <li className="flex items-center gap-2">
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        Waiving fees or penalties
                      </li>
                    </ul>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-3 flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      Override Approvers
                    </h3>
                    <div className="space-y-2">
                      <Badge variant="outline" className="mr-2">Alex</Badge>
                      <Badge variant="outline" className="mr-2">Brenda</Badge>
                      <Badge variant="outline">Tapiwa</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-3">
                      Contact any approver for authorization before proceeding with restricted actions.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Recent Audit Log */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="h-5 w-5" />
                  Recent Activity (30 Days)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {auditLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : auditLogs.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No recent activity</p>
                ) : (
                  <ScrollArea className="h-[300px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Time</TableHead>
                          <TableHead>Action</TableHead>
                          <TableHead>By</TableHead>
                          <TableHead>Details</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {auditLogs.slice(0, 20).map((log) => (
                          <TableRow key={log.id}>
                            <TableCell className="text-xs">
                              {new Date(log.created_at).toLocaleString()}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{log.action}</Badge>
                            </TableCell>
                            <TableCell className="text-sm">{log.performed_by_email}</TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                              {JSON.stringify(log.details)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Customer Lookup Tab */}
          <TabsContent value="lookup" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="h-5 w-5" />
                  Customer Lookup
                </CardTitle>
                <CardDescription>Search by stand number or phone number</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col md:flex-row gap-3">
                  <Select value={searchType} onValueChange={(v: "stand" | "phone") => setSearchType(v)}>
                    <SelectTrigger className="w-full md:w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="stand">
                        <span className="flex items-center gap-2">
                          <MapPin className="h-4 w-4" />
                          Stand Number
                        </span>
                      </SelectItem>
                      <SelectItem value="phone">
                        <span className="flex items-center gap-2">
                          <Phone className="h-4 w-4" />
                          Phone Number
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder={searchType === "stand" ? "e.g., A123" : "e.g., 0771234567"}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    className="flex-1"
                  />
                  <Button onClick={handleSearch} disabled={searchLoading}>
                    {searchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    <span className="ml-2">Search</span>
                  </Button>
                </div>

                {searchResults.length > 0 && (
                  <div className="mt-6 space-y-4">
                    <h3 className="font-medium">Search Results</h3>
                    {searchResults.map((customer) => (
                      <Card key={customer.stand_number} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedCustomer(customer)}>
                        <CardContent className="p-4">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-medium">{customer.full_name}</p>
                              <p className="text-sm text-muted-foreground flex items-center gap-2">
                                <MapPin className="h-3 w-3" />
                                Stand {customer.stand_number}
                              </p>
                            </div>
                            <div className="text-right text-sm">
                              <p className="flex items-center gap-2 justify-end">
                                <Mail className="h-3 w-3" />
                                {customer.email}
                              </p>
                              <p className="flex items-center gap-2 justify-end text-muted-foreground">
                                <Phone className="h-3 w-3" />
                                {customer.phone_number}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {selectedCustomer && (
                  <Card className="mt-4 border-primary">
                    <CardHeader>
                      <CardTitle className="text-lg">Customer Details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <Label className="text-muted-foreground">Full Name</Label>
                          <p className="font-medium">{selectedCustomer.full_name}</p>
                        </div>
                        <div>
                          <Label className="text-muted-foreground">Stand Number</Label>
                          <p className="font-medium">{selectedCustomer.stand_number}</p>
                        </div>
                        <div>
                          <Label className="text-muted-foreground">Email</Label>
                          <p className="font-medium">{selectedCustomer.email}</p>
                        </div>
                        <div>
                          <Label className="text-muted-foreground">Phone</Label>
                          <p className="font-medium">{selectedCustomer.phone_number}</p>
                        </div>
                        <div>
                          <Label className="text-muted-foreground">Payment Start Date</Label>
                          <p className="font-medium">{selectedCustomer.payment_start_date}</p>
                        </div>
                      </div>
                      <div className="flex gap-2 pt-4">
                        <Button size="sm" variant="outline" onClick={() => {
                          setMessageRecipient(selectedCustomer.phone_number);
                          setActiveTab("messaging");
                        }}>
                          <MessageSquare className="h-4 w-4 mr-2" />
                          Send Message
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => {
                          setResetEmail(selectedCustomer.email);
                          setShowResetDialog(true);
                        }}>
                          <Key className="h-4 w-4 mr-2" />
                          Reset Password
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Password Reset Tab */}
          <TabsContent value="password" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  Customer Password Reset
                </CardTitle>
                <CardDescription>Reset customer account passwords securely</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                  <div className="flex gap-3">
                    <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0" />
                    <div className="text-sm">
                      <p className="font-medium text-yellow-800 dark:text-yellow-200">Security Reminder</p>
                      <p className="text-yellow-700 dark:text-yellow-300 mt-1">
                        Always verify customer identity before resetting passwords. Ask for stand number and registered phone number.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 max-w-md">
                  <div>
                    <Label>Customer Email</Label>
                    <Input
                      type="email"
                      placeholder="customer@email.com"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                    />
                  </div>
                  <Button onClick={() => setShowResetDialog(true)} disabled={!resetEmail.trim()}>
                    <Key className="h-4 w-4 mr-2" />
                    Proceed to Reset
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Messaging Tab */}
          <TabsContent value="messaging" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Send WhatsApp / SMS
                </CardTitle>
                <CardDescription>Contact customers via WhatsApp or SMS</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label>Message Type</Label>
                    <Select value={messageType} onValueChange={(v: "sms" | "whatsapp") => setMessageType(v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="whatsapp">WhatsApp</SelectItem>
                        <SelectItem value="sms">SMS</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Recipient Phone Number</Label>
                    <Input
                      placeholder="e.g., +263771234567"
                      value={messageRecipient}
                      onChange={(e) => setMessageRecipient(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <Label>Message</Label>
                  <Textarea
                    placeholder="Type your message here..."
                    value={messageContent}
                    onChange={(e) => setMessageContent(e.target.value)}
                    rows={4}
                  />
                </div>
                <Button onClick={handleSendMessage} disabled={sendingMessage || !messageRecipient.trim() || !messageContent.trim()}>
                  {sendingMessage ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Send {messageType === "whatsapp" ? "WhatsApp" : "SMS"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Knowledge Base Tab */}
          <TabsContent value="knowledge" className="space-y-6">
            <div className="grid md:grid-cols-3 gap-6">
              <Card className="md:col-span-1">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <BookOpen className="h-5 w-5" />
                    Articles
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-2">
                      {knowledgeArticles.map((article) => (
                        <button
                          key={article.id}
                          onClick={() => setSelectedArticle(article)}
                          className={`w-full text-left p-3 rounded-lg transition-colors ${
                            selectedArticle?.id === article.id
                              ? "bg-primary text-primary-foreground"
                              : "hover:bg-muted"
                          }`}
                        >
                          <p className="font-medium text-sm">{article.title}</p>
                          <p className={`text-xs mt-1 ${
                            selectedArticle?.id === article.id
                              ? "text-primary-foreground/70"
                              : "text-muted-foreground"
                          }`}>
                            {article.category}
                          </p>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              <Card className="md:col-span-2">
                <CardContent className="p-6">
                  {selectedArticle ? (
                    <div>
                      <div className="flex items-center gap-2 mb-4">
                        <Badge>{selectedArticle.category}</Badge>
                        {selectedArticle.tags.map((tag) => (
                          <Badge key={tag} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                      <h2 className="text-xl font-bold mb-4">{selectedArticle.title}</h2>
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <pre className="whitespace-pre-wrap font-sans text-sm">
                          {selectedArticle.content}
                        </pre>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-[400px] text-muted-foreground">
                      <BookOpen className="h-12 w-12 mb-4" />
                      <p>Select an article to read</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Password Reset Dialog */}
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Customer Password</DialogTitle>
            <DialogDescription>
              Set a new password for {resetEmail}. The customer should change this immediately after logging in.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>New Temporary Password</Label>
              <Input
                type="text"
                placeholder="Minimum 8 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handlePasswordReset} disabled={resetLoading || newPassword.length < 8}>
              {resetLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Key className="h-4 w-4 mr-2" />}
              Reset Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InternalPortal;
