import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getAnalyticsEnabled, setAnalyticsEnabled } from "@/lib/telemetry";

/**
 * Privacy & analytics controls — linked from the global portal footer.
 * Available before and after login.
 */
const PrivacyAnalytics = () => {
  const [analyticsOn, setAnalyticsOn] = useState(true);

  useEffect(() => {
    setAnalyticsOn(getAnalyticsEnabled());
  }, []);

  const handleToggleOff = (turnOff: boolean) => {
    const enabled = !turnOff;
    setAnalyticsOn(enabled);
    setAnalyticsEnabled(enabled);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-md px-4 py-10 space-y-4">
        <Link to="/" className="text-sm text-primary hover:underline">
          ← Back
        </Link>

        <Card>
          <CardHeader>
            <CardTitle>Privacy &amp; analytics</CardTitle>
            <CardDescription>
              Product analytics help us improve the portal. We do not collect payment amounts
              or personal details. You can turn analytics off on this device at any time.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <Label htmlFor="analytics-toggle" className="text-base">
                  Turn off analytics
                </Label>
                <p className="text-xs text-muted-foreground">
                  When on, this device will not send analytics events.
                </p>
              </div>
              <Switch
                id="analytics-toggle"
                checked={!analyticsOn}
                onCheckedChange={handleToggleOff}
                aria-label="Turn off analytics"
              />
            </div>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          See also our{" "}
          <Link to="/privacy" className="text-primary underline underline-offset-2">
            Privacy notice
          </Link>
          .
        </p>
      </main>
    </div>
  );
};

export default PrivacyAnalytics;
