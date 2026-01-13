import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Calendar, Mail, MessageSquare, TrendingUp, AlertCircle, Users, BarChart3 } from "lucide-react";

interface M365Metrics {
  meetings?: any;
  email?: any;
  chats?: any;
  authStatus?: {
    authenticated: boolean;
    account: any;
  };
}

const Microsoft365Dashboard = () => {

  const [metrics, setMetrics] = useState<M365Metrics>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchM365Data();
  }, []);

  const fetchM365Data = async () => {
    try {
      setLoading(true);
      setError(null);

      // Check authentication status
      const authResponse = await fetch('http://localhost:3000/auth/status');
      const authData = await authResponse.json();
      setMetrics(prev => ({ ...prev, authStatus: authData }));

      if (!authData.authenticated) {
        setError("Please authenticate with Microsoft 365 first");
        return;
      }

      // Fetch metrics
      const [meetingsRes, emailRes, chatsRes] = await Promise.all([
        fetch('http://localhost:3000/api/metrics/meetings').catch(() => null),
        fetch('http://localhost:3000/api/metrics/email').catch(() => null),
        fetch('http://localhost:3000/api/metrics/chat').catch(() => null),
      ]);

      const meetings = meetingsRes ? await meetingsRes.json() : null;
      const email = emailRes ? await emailRes.json() : null;
      const chats = chatsRes ? await chatsRes.json() : null;

      setMetrics(prev => ({
        ...prev,
        meetings,
        email,
        chats
      }));

    } catch (err) {
      setError("Failed to connect to Microsoft 365 service");
      console.error("M365 fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAuthenticate = () => {
    window.open('http://localhost:3000/auth/login', '_blank');
  };

  const handleRefresh = () => {
    fetchM365Data();
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="ml-2">Loading Microsoft 365 data...</span>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <div className="flex gap-2 mt-4">
          <Button onClick={handleAuthenticate} variant="outline">
            Authenticate with Microsoft 365
          </Button>
          <Button onClick={handleRefresh} variant="outline">
            Retry
          </Button>
        </div>
      </Card>
    );
  }

  const { meetings, email, chats, authStatus } = metrics;

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <BarChart3 className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Microsoft 365 Integration</h3>
              <p className="text-sm text-muted-foreground">Real-time productivity insights</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={authStatus?.authenticated ? "default" : "destructive"}>
              {authStatus?.authenticated ? "Connected" : "Not Connected"}
            </Badge>
            <Button onClick={handleRefresh} size="sm" variant="outline">
              Refresh
            </Button>
          </div>
        </div>

        {/* User Info */}
        {authStatus?.authenticated && authStatus.account && (
          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-medium">{authStatus.account.name || "User"}</p>
              <p className="text-sm text-muted-foreground">{authStatus.account.upn}</p>
            </div>
          </div>
        )}
      </Card>

      {/* Metrics Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Meetings */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="h-5 w-5 text-blue-500" />
            <h4 className="font-semibold">Meetings</h4>
          </div>
          <div className="text-2xl font-bold text-primary">
            {meetings?.meetings?.length || 0}
          </div>
          <p className="text-sm text-muted-foreground">Active meetings</p>
          <div className="mt-2 text-xs text-green-600">Real-time sync</div>
        </Card>

        {/* Email Activity */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-2">
            <Mail className="h-5 w-5 text-green-500" />
            <h4 className="font-semibold">Email Activity</h4>
          </div>
          <div className="text-2xl font-bold text-primary">
            {email?.report?.length || 0}
          </div>
          <p className="text-sm text-muted-foreground">Email reports</p>
          <div className="mt-2 text-xs text-green-600">Last 30 days</div>
        </Card>

        {/* Teams Chats */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare className="h-5 w-5 text-purple-500" />
            <h4 className="font-semibold">Teams Chats</h4>
          </div>
          <div className="text-2xl font-bold text-primary">
            {chats?.chats?.length || 0}
          </div>
          <p className="text-sm text-muted-foreground">Active conversations</p>
          <div className="mt-2 text-xs text-green-600">Live updates</div>
        </Card>
      </div>

      {/* ROI Calculator Link */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="h-5 w-5 text-orange-500" />
          <h4 className="font-semibold">Advanced Analytics</h4>
        </div>
        <p className="text-muted-foreground mb-4">
          Calculate time savings and productivity gains from your Microsoft 365 usage.
        </p>
        <Button
          onClick={() => window.open('http://localhost:3000', '_blank')}
          className="w-full"
        >
          Open Full Microsoft 365 Dashboard
        </Button>
      </Card>
    </div>
  );
};

export default Microsoft365Dashboard;