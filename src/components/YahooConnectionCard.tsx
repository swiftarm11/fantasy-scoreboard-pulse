import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Loader2, ExternalLink, Unlink } from 'lucide-react';
import { useYahooOAuth } from '../hooks/useYahooOAuth';
import { YahooConfigStatus } from './YahooConfigStatus';
import { yahooOAuth } from '../utils/yahooOAuth';

export const YahooConnectionCard = () => {
  const { isConnected, userInfo, isLoading, connect, disconnect } = useYahooOAuth();
  const isConfigured = yahooOAuth.isConfigured();

  return (
    <div className="space-y-4">
      <YahooConfigStatus />
      
      {!isConfigured ? null : (
        <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="text-lg">🏈</span>
          Yahoo Fantasy Sports
          {isConnected && <Badge variant="secondary">Connected</Badge>}
        </CardTitle>
        <CardDescription>
          Connect your Yahoo Fantasy Sports account to import leagues and data
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isConnected && userInfo ? (
          <div className="flex items-center justify-between p-3 bg-secondary/50 rounded-md">
            <div>
              <p className="font-medium">{userInfo.nickname}</p>
              <p className="text-sm text-muted-foreground">Connected Account</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={disconnect}
              className="mobile-touch-target"
            >
              <Unlink className="w-4 h-4 mr-2" />
              Disconnect
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="p-3 bg-secondary/30 rounded-md">
              <p className="text-sm text-muted-foreground">
                After connecting, you'll be able to:
              </p>
              <ul className="text-sm text-muted-foreground mt-2 space-y-1">
                <li>• Import Yahoo Fantasy leagues</li>
                <li>• View real-time scores and standings</li>
                <li>• Get scoring event notifications</li>
              </ul>
            </div>
            
            <Button
              onClick={connect}
              disabled={isLoading}
              className="w-full mobile-touch-target"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Connect Yahoo Account
                </>
              )}
            </Button>
          </div>
        )}

        <div className="text-xs text-muted-foreground">
          <p>
            <strong>Permissions:</strong> Fantasy Sports Read (fspt-r)
          </p>
          <p className="mt-1">
            This allows reading your fantasy league data but cannot make changes to your teams.
          </p>
        </div>
        </CardContent>
        </Card>
      )}
    </div>
  );
};