import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Save, Trash2, ArrowLeft } from "lucide-react";
import BottomNav from "@/components/BottomNav";
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
import { Switch } from "@/components/ui/switch";

interface User {
  email: string;
  fullName: string;
  role: string;
  accessToReporting: boolean;
}

const AccountManagement = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    checkAccess();
  }, []);

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

      if (!data.isSuperAdmin) {
        toast.error("Access denied. Only Super Admins can manage user access.");
        navigate("/");
        return;
      }

      setIsSuperAdmin(true);
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

  const saveUsers = async () => {
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-user-access', {
        body: {
          action: 'update',
          users: users
        }
      });
      
      if (error) throw error;
      
      toast.success("Access control updated successfully");
    } catch (error: any) {
      console.error('Error saving users:', error);
      toast.error("Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  const addUser = () => {
    setUsers([...users, {
      email: '',
      fullName: '',
      role: 'Viewer',
      accessToReporting: false
    }]);
  };

  const removeUser = (index: number) => {
    setUsers(users.filter((_, i) => i !== index));
  };

  const updateUser = (index: number, field: keyof User, value: any) => {
    const newUsers = [...users];
    newUsers[index] = { ...newUsers[index], [field]: value };
    setUsers(newUsers);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="bg-primary text-primary-foreground p-4 md:p-6 shadow-lg">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-xl md:text-3xl font-bold">User Access Control</h1>
            <p className="text-sm md:text-base text-primary-foreground/80">Manage reporting access permissions</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/reporting")}
            className="text-primary-foreground border-primary-foreground/20 hover:bg-primary-foreground/10"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Reporting
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex justify-between items-center">
              <span>User Access List</span>
              <div className="flex gap-2">
                <Button onClick={addUser} size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add User
                </Button>
                <Button onClick={saveUsers} disabled={saving} size="sm">
                  {saving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save Changes
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email Address</TableHead>
                      <TableHead>Full Name</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Access to Reporting</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <Input
                            type="email"
                            value={user.email}
                            onChange={(e) => updateUser(index, 'email', e.target.value)}
                            placeholder="user@example.com"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={user.fullName}
                            onChange={(e) => updateUser(index, 'fullName', e.target.value)}
                            placeholder="Full Name"
                          />
                        </TableCell>
                        <TableCell>
                          <Select
                            value={user.role}
                            onValueChange={(value) => updateUser(index, 'role', value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Admin">Admin</SelectItem>
                              <SelectItem value="Viewer">Viewer</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={user.accessToReporting}
                            onCheckedChange={(checked) => updateUser(index, 'accessToReporting', checked)}
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => removeUser(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {users.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No users added yet. Click "Add User" to create the first entry.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Instructions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><strong>Super Admins:</strong> alex@michaeltenable.com and alex@lakecity.co.zw (cannot be changed)</p>
            <p><strong>Admin Role:</strong> Can view all reporting data</p>
            <p><strong>Viewer Role:</strong> Can view basic reporting data</p>
            <p><strong>Access to Reporting:</strong> Toggle "Yes" to grant access to the Reporting page</p>
            <p className="text-red-600"><strong>Important:</strong> Never add customer emails to this list. This is for internal staff only.</p>
          </CardContent>
        </Card>
      </div>

      <BottomNav />
    </div>
  );
};

export default AccountManagement;
