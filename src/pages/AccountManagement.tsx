import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Shield, Users, Filter, X, ShieldCheck, Eye, Phone, Pencil } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import InternalNav from "@/components/InternalNav";
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
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { format } from "date-fns";

interface UserRecord {
  id: string;
  userId: string;
  email: string;
  fullName: string;
  accountType: string;
  role: string;
  accountCreated: boolean;
  accountCreatedDate: string | null;
  lastPasswordReset: string | null;
  hasReportingAccess: boolean;
  isOverrideApprover: boolean;
  forcePasswordChange: boolean;
  isSuperAdmin: boolean;
  createdAt: string;
  isInternal: boolean;
  standNumber?: string;
  phoneNumber?: string | null;
  phoneNumber2?: string | null;
}

const accountTypeOptions = [
  { value: 'all', label: 'All Account Types' },
  { value: 'Customer', label: 'Customer' },
  { value: 'Staff – Admin', label: 'Staff – Admin' },
  { value: 'Staff – Director', label: 'Staff – Director' },
  { value: 'Super Admin', label: 'Super Admin' },
];

const accountCreatedOptions = [
  { value: 'all', label: 'All' },
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

const reportingAccessOptions = [
  { value: 'all', label: 'All' },
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

const AccountManagement = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserRecord[]>([]);
  const [hasAccess, setHasAccess] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isDirector, setIsDirector] = useState(false);

  // Filters
  const [accountTypeFilter, setAccountTypeFilter] = useState('all');
  const [accountCreatedFilter, setAccountCreatedFilter] = useState('all');
  const [reportingAccessFilter, setReportingAccessFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Add user dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserFullName, setNewUserFullName] = useState('');
  const [newUserRole, setNewUserRole] = useState('admin');
  const [addingUser, setAddingUser] = useState(false);

  // Edit phone dialog
  const [editPhoneDialogOpen, setEditPhoneDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [newPhoneNumber, setNewPhoneNumber] = useState('');
  const [newPhoneNumber2, setNewPhoneNumber2] = useState('');
  const [editingPhoneField, setEditingPhoneField] = useState<'primary' | 'secondary'>('primary');
  const [updatingPhone, setUpdatingPhone] = useState(false);
  const [phoneValidationError, setPhoneValidationError] = useState<{
    message: string;
    sheetPhoneNumber?: string;
    instruction?: string;
  } | null>(null);

  useEffect(() => {
    checkAccess();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [users, accountTypeFilter, accountCreatedFilter, reportingAccessFilter, searchQuery]);

  const checkAccess = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast.error("Please log in");
        navigate("/login");
        return;
      }

      const { data, error } = await supabase.functions.invoke('check-reporting-access');
      
      if (error) throw error;

      // Check if user is Super Admin or Director (both can access user management)
      if (!data.isSuperAdmin && !data.isDirector) {
        toast.error("Access denied. Only Super Admins and Directors can manage user access.");
        navigate("/");
        return;
      }

      setIsSuperAdmin(data.isSuperAdmin);
      setIsDirector(data.isDirector);
      setHasAccess(true);
      await fetchUsers();
    } catch (error: any) {
      console.error('Error checking access:', error);
      toast.error("Failed to verify access");
      navigate("/");
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('manage-user-access', {
        body: { action: 'fetch' }
      });
      
      if (error) throw error;
      
      setUsers(data.users || []);
    } catch (error: any) {
      console.error('Error fetching users:', error);
      toast.error("Failed to load users");
    }
  };

  const applyFilters = () => {
    let filtered = [...users];

    // Account type filter
    if (accountTypeFilter !== 'all') {
      filtered = filtered.filter(u => u.accountType === accountTypeFilter);
    }

    // Account created filter
    if (accountCreatedFilter !== 'all') {
      const isCreated = accountCreatedFilter === 'yes';
      filtered = filtered.filter(u => u.accountCreated === isCreated);
    }

    // Reporting access filter
    if (reportingAccessFilter !== 'all') {
      const hasAccess = reportingAccessFilter === 'yes';
      filtered = filtered.filter(u => u.hasReportingAccess === hasAccess);
    }

    // Search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(u => 
        u.email.toLowerCase().includes(query) ||
        u.fullName.toLowerCase().includes(query)
      );
    }

    setFilteredUsers(filtered);
  };

  const clearFilters = () => {
    setAccountTypeFilter('all');
    setAccountCreatedFilter('all');
    setReportingAccessFilter('all');
    setSearchQuery('');
  };

  const hasActiveFilters = accountTypeFilter !== 'all' || 
    accountCreatedFilter !== 'all' || 
    reportingAccessFilter !== 'all' || 
    searchQuery.trim() !== '';

  const updateUserRole = async (userId: string, newRole: string) => {
    if (!isSuperAdmin) {
      toast.error("Only Super Admins can change roles");
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('manage-user-access', {
        body: { 
          action: 'updateRole',
          userData: { userId, newRole }
        }
      });
      
      if (error) throw error;
      
      toast.success("Role updated successfully");
      await fetchUsers();
    } catch (error: any) {
      console.error('Error updating role:', error);
      toast.error(error.message || "Failed to update role");
    }
  };

  const addInternalUser = async () => {
    if (!isSuperAdmin) {
      toast.error("Only Super Admins can add internal users");
      return;
    }

    if (!newUserEmail.endsWith('@lakecity.co.zw')) {
      toast.error("Only @lakecity.co.zw emails can be added");
      return;
    }

    setAddingUser(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-user-access', {
        body: { 
          action: 'addInternalUser',
          userData: { 
            email: newUserEmail,
            fullName: newUserFullName,
            role: newUserRole
          }
        }
      });
      
      if (error) throw error;
      
      toast.success("Internal user added successfully");
      setAddDialogOpen(false);
      setNewUserEmail('');
      setNewUserFullName('');
      setNewUserRole('admin');
      await fetchUsers();
    } catch (error: any) {
      console.error('Error adding user:', error);
      toast.error(error.message || "Failed to add user");
    } finally {
      setAddingUser(false);
    }
  };

  const openEditPhoneDialog = (user: UserRecord, field: 'primary' | 'secondary' = 'primary') => {
    setEditingUser(user);
    setEditingPhoneField(field);
    if (field === 'primary') {
      setNewPhoneNumber(user.phoneNumber || '');
    } else {
      setNewPhoneNumber2(user.phoneNumber2 || '');
    }
    setPhoneValidationError(null);
    setEditPhoneDialogOpen(true);
  };

  const closeEditPhoneDialog = () => {
    setEditPhoneDialogOpen(false);
    setEditingUser(null);
    setNewPhoneNumber('');
    setNewPhoneNumber2('');
    setEditingPhoneField('primary');
    setPhoneValidationError(null);
  };

  const updatePhoneNumber = async () => {
    if (!isSuperAdmin || !editingUser) {
      toast.error("Only Super Admins can update phone numbers");
      return;
    }

    const phoneToUpdate = editingPhoneField === 'primary' ? newPhoneNumber : newPhoneNumber2;
    
    if (!phoneToUpdate.trim()) {
      // If clearing secondary phone, allow it
      if (editingPhoneField === 'secondary') {
        setUpdatingPhone(true);
        try {
          const { data, error } = await supabase.functions.invoke('manage-user-access', {
            body: { 
              action: 'updatePhoneNumber2',
              userData: { 
                userId: editingUser.userId,
                newPhoneNumber2: ''
              }
            }
          });
          
          if (error) throw error;
          
          toast.success(`Secondary phone number removed for Stand ${editingUser.standNumber || editingUser.email}`);
          closeEditPhoneDialog();
          await fetchUsers();
        } catch (error: any) {
          toast.error(error.message || "Failed to remove phone number");
        } finally {
          setUpdatingPhone(false);
        }
        return;
      }
      toast.error("Phone number is required");
      return;
    }

    setUpdatingPhone(true);
    setPhoneValidationError(null);
    
    try {
      const action = editingPhoneField === 'primary' ? 'updatePhoneNumber' : 'updatePhoneNumber2';
      const payload = editingPhoneField === 'primary' 
        ? { userId: editingUser.userId, newPhoneNumber: phoneToUpdate.trim() }
        : { userId: editingUser.userId, newPhoneNumber2: phoneToUpdate.trim() };
      
      const { data, error } = await supabase.functions.invoke('manage-user-access', {
        body: { 
          action,
          userData: payload
        }
      });
      
      // Check for validation errors in the response
      if (data?.validationError) {
        setPhoneValidationError({
          message: data.message || 'Phone number does not match Collection Schedule',
          sheetPhoneNumber: data.details?.sheetPhoneNumber,
          instruction: data.details?.instruction
        });
        return;
      }
      
      if (error) throw error;
      
      const phoneLabel = editingPhoneField === 'primary' ? 'Primary' : 'Secondary';
      toast.success(`${phoneLabel} phone number updated for Stand ${editingUser.standNumber || editingUser.email}`);
      closeEditPhoneDialog();
      await fetchUsers();
    } catch (error: any) {
      console.error('Error updating phone number:', error);
      
      // Try to parse error message for validation details
      let errorMessage = error.message || "Failed to update phone number";
      
      // Check if error contains validation details
      if (errorMessage.includes('Collection Schedule')) {
        setPhoneValidationError({
          message: errorMessage,
          instruction: 'Please update the Collection Schedule first, then enter the same number here.'
        });
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setUpdatingPhone(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '—';
    try {
      return format(new Date(dateString), 'dd MMM yyyy');
    } catch {
      return '—';
    }
  };

  const getAccountTypeBadge = (accountType: string) => {
    switch (accountType) {
      case 'Super Admin':
        return <Badge className="bg-purple-600 hover:bg-purple-700"><ShieldCheck className="h-3 w-3 mr-1" /> Super Admin</Badge>;
      case 'Staff – Director':
        return <Badge className="bg-blue-600 hover:bg-blue-700"><Shield className="h-3 w-3 mr-1" /> Director</Badge>;
      case 'Staff – Admin':
        return <Badge className="bg-teal-600 hover:bg-teal-700"><Users className="h-3 w-3 mr-1" /> Admin</Badge>;
      case 'Customer':
        return <Badge variant="secondary">Customer</Badge>;
      default:
        return <Badge variant="outline">{accountType}</Badge>;
    }
  };

  const getRoleBadge = (role: string, isSuperAdmin: boolean) => {
    if (isSuperAdmin) {
      return <Badge variant="outline" className="border-purple-400 text-purple-600">super_admin</Badge>;
    }
    switch (role) {
      case 'director':
        return <Badge variant="outline" className="border-blue-400 text-blue-600">director</Badge>;
      case 'admin':
        return <Badge variant="outline" className="border-teal-400 text-teal-600">admin</Badge>;
      case 'helpdesk':
        return <Badge variant="outline" className="border-gray-400 text-gray-600">helpdesk</Badge>;
      case 'customer':
        return <Badge variant="outline" className="border-gray-300 text-gray-500">customer</Badge>;
      default:
        return <Badge variant="outline">{role}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
        <Shield className="h-16 w-16 text-muted-foreground mb-4" />
        <h1 className="text-2xl font-bold mb-2">Access Restricted</h1>
        <p className="text-muted-foreground text-center mb-4">
          You do not have permission to access this page.
        </p>
        <Button onClick={() => navigate("/")}>Return to Home</Button>
      </div>
    );
  }

  const internalUsersCount = users.filter(u => u.isInternal).length;
  const customersCount = users.filter(u => !u.isInternal).length;

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="bg-primary text-primary-foreground p-4 md:p-6 shadow-lg">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-xl md:text-3xl font-bold">User Access Control</h1>
            <p className="text-sm md:text-base text-primary-foreground/80">
              Manage internal staff access and view all users
            </p>
          </div>
          <InternalNav 
            isSuperAdmin={isSuperAdmin} 
            isDirector={isDirector} 
            currentPage="access"
          />
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Total Users</p>
              <p className="text-2xl font-bold">{users.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Internal Staff</p>
              <p className="text-2xl font-bold">{internalUsersCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Customers</p>
              <p className="text-2xl font-bold">{customersCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Filtered Results</p>
              <p className="text-2xl font-bold">{filteredUsers.length}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Filter className="h-5 w-5" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div>
                <Label className="text-sm mb-2 block">Search</Label>
                <Input
                  placeholder="Email or name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-12"
                />
              </div>
              <div>
                <Label className="text-sm mb-2 block">Account Type</Label>
                <Select value={accountTypeFilter} onValueChange={setAccountTypeFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {accountTypeOptions.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm mb-2 block">Account Created</Label>
                <Select value={accountCreatedFilter} onValueChange={setAccountCreatedFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {accountCreatedOptions.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm mb-2 block">Reporting Access</Label>
                <Select value={reportingAccessFilter} onValueChange={setReportingAccessFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {reportingAccessOptions.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                {hasActiveFilters && (
                  <Button variant="outline" size="sm" onClick={clearFilters} className="w-full">
                    <X className="h-4 w-4 mr-2" />
                    Clear Filters
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* User List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex justify-between items-center">
              <span>User Access List</span>
              {isSuperAdmin && (
                <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Internal User
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Internal User</DialogTitle>
                      <DialogDescription>
                        Add a new staff member to the internal portal. Only @lakecity.co.zw emails are allowed.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div>
                        <Label>Email Address</Label>
                        <Input
                          type="email"
                          placeholder="name@lakecity.co.zw"
                          value={newUserEmail}
                          onChange={(e) => setNewUserEmail(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Full Name</Label>
                        <Input
                          placeholder="Full Name"
                          value={newUserFullName}
                          onChange={(e) => setNewUserFullName(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Role</Label>
                        <Select value={newUserRole} onValueChange={setNewUserRole}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="director">Director</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={addInternalUser} disabled={addingUser || !newUserEmail}>
                        {addingUser ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Add User
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}

              {/* Edit Phone Number Dialog */}
              <Dialog open={editPhoneDialogOpen} onOpenChange={(open) => !open && closeEditPhoneDialog()}>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Phone className="h-5 w-5" />
                      Edit {editingPhoneField === 'primary' ? 'Primary' : 'Secondary'} Phone Number
                    </DialogTitle>
                    <DialogDescription>
                      Update the phone number for {editingUser?.standNumber ? `Stand ${editingUser.standNumber}` : editingUser?.email}.
                    </DialogDescription>
                  </DialogHeader>
                  
                  {editingPhoneField === 'primary' ? (
                    <>
                      {/* Important Notice for Primary */}
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                        <p className="font-semibold text-amber-800 mb-1">⚠️ Important: Update Collection Schedule First</p>
                        <p className="text-amber-700">
                          The primary phone number must <strong>exactly match</strong> what is in the Collection Schedule spreadsheet. 
                          Please update the spreadsheet first, then enter the same number here.
                        </p>
                      </div>

                      <div className="space-y-4 py-2">
                        <div>
                          <Label className="text-muted-foreground">Current Primary Phone Number</Label>
                          <p className="text-sm font-mono py-1 px-2 bg-muted rounded">
                            {editingUser?.phoneNumber || 'Not set'}
                          </p>
                        </div>
                        
                        <div>
                          <Label htmlFor="new-phone">New Phone Number (from Collection Schedule)</Label>
                          <Input
                            id="new-phone"
                            type="tel"
                            placeholder="+18452757810"
                            value={newPhoneNumber}
                            onChange={(e) => {
                              setNewPhoneNumber(e.target.value);
                              setPhoneValidationError(null);
                            }}
                            className={`font-mono ${phoneValidationError ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            Use international format with country code (e.g., +1 for US, +263 for Zimbabwe)
                          </p>
                        </div>

                        {phoneValidationError && (
                          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                            <p className="font-semibold text-red-800 text-sm mb-1">❌ Validation Failed</p>
                            <p className="text-red-700 text-sm">{phoneValidationError.message}</p>
                            {phoneValidationError.sheetPhoneNumber && (
                              <div className="mt-2 p-2 bg-white rounded border border-red-100">
                                <p className="text-xs text-muted-foreground">Phone number in Collection Schedule:</p>
                                <p className="font-mono text-sm font-semibold text-red-800">{phoneValidationError.sheetPhoneNumber}</p>
                              </div>
                            )}
                            {phoneValidationError.instruction && (
                              <p className="text-xs text-red-600 mt-2 italic">{phoneValidationError.instruction}</p>
                            )}
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Info Notice for Secondary */}
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                        <p className="font-semibold text-blue-800 mb-1">ℹ️ Secondary Phone Number</p>
                        <p className="text-blue-700">
                          This is an additional phone number for 2FA. It does not need to match the Collection Schedule.
                          Leave empty to remove the secondary number.
                        </p>
                      </div>

                      <div className="space-y-4 py-2">
                        <div>
                          <Label className="text-muted-foreground">Current Secondary Phone Number</Label>
                          <p className="text-sm font-mono py-1 px-2 bg-muted rounded">
                            {editingUser?.phoneNumber2 || 'Not set'}
                          </p>
                        </div>
                        
                        <div>
                          <Label htmlFor="new-phone-2">Secondary Phone Number</Label>
                          <Input
                            id="new-phone-2"
                            type="tel"
                            placeholder="+18452757810 (or leave empty to remove)"
                            value={newPhoneNumber2}
                            onChange={(e) => {
                              setNewPhoneNumber2(e.target.value);
                              setPhoneValidationError(null);
                            }}
                            className="font-mono"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            Use international format with country code
                          </p>
                        </div>
                      </div>
                    </>
                  )}
                  
                  <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="outline" onClick={closeEditPhoneDialog}>
                      Cancel
                    </Button>
                    <Button 
                      onClick={updatePhoneNumber} 
                      disabled={updatingPhone || (editingPhoneField === 'primary' && !newPhoneNumber.trim())}
                    >
                      {updatingPhone ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      {editingPhoneField === 'primary' ? 'Validate & Update' : 'Update'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email Address</TableHead>
                    <TableHead>Full Name</TableHead>
                    <TableHead>Stand Number</TableHead>
                    <TableHead>Primary Phone</TableHead>
                    <TableHead>Secondary Phone</TableHead>
                    <TableHead>Account Type</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Account Created</TableHead>
                    <TableHead>Created Date</TableHead>
                    <TableHead>Last Password Reset</TableHead>
                    <TableHead>Reporting Access</TableHead>
                    {isSuperAdmin && <TableHead>Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow key={user.id} className={user.isInternal ? '' : 'bg-muted/30'}>
                      <TableCell className="font-medium">{user.email}</TableCell>
                      <TableCell>{user.fullName || '—'}</TableCell>
                      <TableCell>
                        {user.standNumber ? (
                          <Badge variant="outline" className="font-mono text-xs">{user.standNumber}</Badge>
                        ) : '—'}
                      </TableCell>
                      <TableCell>
                        {!user.isInternal ? (
                          <div className="flex items-center gap-1">
                            <span className="text-sm font-mono">{user.phoneNumber || '—'}</span>
                            {isSuperAdmin && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={() => openEditPhoneDialog(user, 'primary')}
                                title="Edit primary phone number"
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        ) : '—'}
                      </TableCell>
                      <TableCell>
                        {!user.isInternal ? (
                          <div className="flex items-center gap-1">
                            <span className="text-sm font-mono">{user.phoneNumber2 || '—'}</span>
                            {isSuperAdmin && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={() => openEditPhoneDialog(user, 'secondary')}
                                title="Edit secondary phone number"
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        ) : '—'}
                      </TableCell>
                      <TableCell>{getAccountTypeBadge(user.accountType)}</TableCell>
                      <TableCell>{getRoleBadge(user.role, user.isSuperAdmin)}</TableCell>
                      <TableCell>
                        {user.accountCreated ? (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Yes</Badge>
                        ) : (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">No</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(user.accountCreatedDate)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(user.lastPasswordReset)}
                      </TableCell>
                      <TableCell>
                        {user.hasReportingAccess ? (
                          <Badge className="bg-green-600 hover:bg-green-700">Yes</Badge>
                        ) : (
                          <Badge variant="secondary">No</Badge>
                        )}
                      </TableCell>
                      {isSuperAdmin && (
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {user.isInternal && !user.isSuperAdmin && (
                              <Select
                                value={user.role}
                                onValueChange={(value) => updateUserRole(user.userId, value)}
                              >
                                <SelectTrigger className="w-28">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="admin">Admin</SelectItem>
                                  <SelectItem value="director">Director</SelectItem>
                                  <SelectItem value="helpdesk">Helpdesk</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                            {user.isSuperAdmin && (
                              <span className="text-xs text-muted-foreground italic">Protected</span>
                            )}
                            {!user.isInternal && (
                              <div className="flex items-center gap-1">
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="text-muted-foreground h-8 w-8 p-0"
                                  onClick={() => openEditPhoneDialog(user)}
                                  title="Edit phone number"
                                >
                                  <Phone className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="sm" className="text-muted-foreground h-8 w-8 p-0">
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {filteredUsers.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                {hasActiveFilters 
                  ? "No users match the current filters." 
                  : "No users found."}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Instructions */}
        <Card>
          <CardHeader>
            <CardTitle>Role Definitions & Instructions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 text-sm">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-purple-50 border border-purple-100">
                <ShieldCheck className="h-5 w-5 text-purple-600 mt-0.5" />
                <div>
                  <p className="font-semibold text-purple-800">Super Admin</p>
                  <p className="text-purple-600">Full access to all internal pages. Can change roles and permissions. Cannot be modified.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 border border-blue-100">
                <Shield className="h-5 w-5 text-blue-600 mt-0.5" />
                <div>
                  <p className="font-semibold text-blue-800">Director</p>
                  <p className="text-blue-600">Can access Reporting, User Access Management, and Looking Glass.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-teal-50 border border-teal-100">
                <Users className="h-5 w-5 text-teal-600 mt-0.5" />
                <div>
                  <p className="font-semibold text-teal-800">Admin</p>
                  <p className="text-teal-600">Can access Internal Portal and Looking Glass only. No access to Reporting or User Management.</p>
                </div>
              </div>
            </div>
            
            <div className="pt-4 border-t">
              <p className="text-red-600 text-sm">
                <strong>Important:</strong> This page is for internal staff management only. Customer accounts are shown for visibility but cannot be modified here.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <BottomNav />
    </div>
  );
};

export default AccountManagement;
