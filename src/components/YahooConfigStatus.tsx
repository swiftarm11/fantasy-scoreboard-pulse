import { AlertCircle, CheckCircle2, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { yahooOAuth } from '../utils/yahooOAuth';

export const YahooConfigStatus = () => {
  const configStatus = yahooOAuth.getConfigurationStatus();
  const isConfigured = configStatus.isValid;

  if (isConfigured) {
    return (
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <CardTitle className="text-sm">Yahoo OAuth Configured</CardTitle>
            <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 border-emerald-200">
              Ready
            </Badge>
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="border-destructive/20 bg-destructive/5">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <CardTitle className="text-sm text-destructive">Yahoo OAuth Not Configured</CardTitle>
          <Badge variant="destructive">Missing Config</Badge>
        </div>
        <CardDescription>
          Yahoo Fantasy Sports integration requires environment variables to be configured.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-2">
              <p className="font-medium">Missing Environment Variables:</p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                {configStatus.missing.map((variable) => (
                  <li key={variable} className="font-mono text-xs bg-muted px-2 py-1 rounded">
                    {variable}
                  </li>
                ))}
              </ul>
            </div>
          </AlertDescription>
        </Alert>

        <div className="space-y-3">
          <h4 className="text-sm font-medium">Setup Instructions:</h4>
          <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
            <li>Create a Yahoo Developer application at the Yahoo Developer Console</li>
            <li>Configure your app with the redirect URI: <code className="bg-muted px-1 py-0.5 rounded text-xs">{window.location.origin}/auth/yahoo/callback</code></li>
            <li>Add the required environment variables to your deployment</li>
            <li>Restart your application</li>
          </ol>
          
          <Button variant="outline" size="sm" asChild>
            <a
              href="https://developer.yahoo.com/apps/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2"
            >
              Yahoo Developer Console
              <ExternalLink className="h-3 w-3" />
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};