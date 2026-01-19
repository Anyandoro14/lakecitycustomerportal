import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";

interface AuditDetailsCollapsibleProps {
  details: Record<string, any> | null;
}

// Human-readable labels for common keys
const keyLabels: Record<string, string> = {
  recipient: "Recipient",
  messagePreview: "Message Preview",
  searchType: "Search Type",
  searchQuery: "Search Query",
  results_count: "Results Found",
  customer_name: "Customer Name",
  session_start: "Session Started",
  stand_number: "Stand Number",
  customer_email: "Customer Email",
  customer_phone: "Phone Number",
  newRole: "New Role",
  oldRole: "Previous Role",
  targetEmail: "Target User",
  ip_address: "IP Address",
  user_agent: "Browser",
  action_type: "Action Type",
  invitation_token: "Invitation ID",
  expires_at: "Expires At",
  sent_via: "Sent Via",
  channel: "Channel",
  status: "Status",
  timestamp: "Timestamp",
  userId: "User ID",
  email: "Email",
  phone: "Phone",
  amount: "Amount",
  payment_date: "Payment Date",
  reference: "Reference",
};

// Format value for display
const formatValue = (key: string, value: any): string => {
  if (value === null || value === undefined) return "N/A";
  
  // Handle dates
  if (key.includes("date") || key.includes("_at") || key === "timestamp") {
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date.toLocaleString();
    }
  }
  
  // Handle booleans
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  
  // Handle objects/arrays
  if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }
  
  // Handle long strings
  if (typeof value === "string" && value.length > 100) {
    return value.substring(0, 100) + "...";
  }
  
  return String(value);
};

// Get human-readable label for a key
const getLabel = (key: string): string => {
  if (keyLabels[key]) return keyLabels[key];
  
  // Convert snake_case or camelCase to Title Case
  return key
    .replace(/_/g, " ")
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
};

const AuditDetailsCollapsible = ({ details }: AuditDetailsCollapsibleProps) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!details || Object.keys(details).length === 0) {
    return <span className="text-muted-foreground text-xs">No details</span>;
  }

  const entries = Object.entries(details).filter(
    ([_, value]) => value !== null && value !== undefined && value !== ""
  );

  if (entries.length === 0) {
    return <span className="text-muted-foreground text-xs">No details</span>;
  }

  // Get a preview of the first meaningful entry
  const previewEntry = entries[0];
  const previewText = `${getLabel(previewEntry[0])}: ${formatValue(previewEntry[0], previewEntry[1])}`;
  const truncatedPreview = previewText.length > 40 ? previewText.substring(0, 40) + "..." : previewText;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-auto p-1 text-xs text-left justify-start font-normal hover:bg-muted"
        >
          {isOpen ? (
            <ChevronDown className="h-3 w-3 mr-1 flex-shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 mr-1 flex-shrink-0" />
          )}
          <span className="truncate">{truncatedPreview}</span>
          {entries.length > 1 && (
            <span className="ml-1 text-muted-foreground">
              (+{entries.length - 1} more)
            </span>
          )}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2">
        <div className="bg-muted/50 rounded-md p-3 space-y-2 text-xs border">
          {entries.map(([key, value]) => (
            <div key={key} className="flex flex-col gap-0.5">
              <span className="font-medium text-foreground">{getLabel(key)}</span>
              <span className="text-muted-foreground break-all whitespace-pre-wrap">
                {formatValue(key, value)}
              </span>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export default AuditDetailsCollapsible;
