import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { yahooFantasyAPI } from '../services/YahooFantasyAPI';
import { useYahooOAuth } from '../hooks/useYahooOAuth';

export const YahooRateLimitStatus = () => {
  const { isConnected } = useYahooOAuth();
  const [rateLimitStatus, setRateLimitStatus] = useState({
    queueLength: 0,
    lastRequestTime: 0,
    isProcessing: false
  });

  useEffect(() => {
    if (!isConnected) return;

    const interval = setInterval(() => {
      const status = yahooFantasyAPI.getRateLimitStatus();
      setRateLimitStatus(status);
    }, 1000);

    return () => clearInterval(interval);
  }, [isConnected]);

  if (!isConnected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Yahoo API Rate Limits</CardTitle>
          <CardDescription>Connect Yahoo account to view rate limit status</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const timeSinceLastRequest = rateLimitStatus.lastRequestTime 
    ? Math.floor((Date.now() - rateLimitStatus.lastRequestTime) / 1000)
    : null;

  const getQueueStatus = () => {
    if (rateLimitStatus.queueLength === 0) return 'default';
    if (rateLimitStatus.queueLength < 5) return 'secondary';
    return 'destructive';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Yahoo API Rate Limits</CardTitle>
        <CardDescription>Monitor API request queue and timing</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Queue Length:</span>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={getQueueStatus()}>
                {rateLimitStatus.queueLength}
              </Badge>
              {rateLimitStatus.isProcessing && (
                <span className="text-xs text-muted-foreground">Processing...</span>
              )}
            </div>
          </div>
          
          <div>
            <span className="text-muted-foreground">Last Request:</span>
            <div className="mt-1">
              {timeSinceLastRequest !== null ? (
                <Badge variant="outline">
                  {timeSinceLastRequest}s ago
                </Badge>
              ) : (
                <Badge variant="outline">Never</Badge>
              )}
            </div>
          </div>
        </div>

        <div className="text-xs text-muted-foreground space-y-1">
          <p><strong>Rate Limit:</strong> 1 request per 1.1 seconds</p>
          <p><strong>Status:</strong> {rateLimitStatus.isProcessing ? 'Active' : 'Idle'}</p>
          {rateLimitStatus.queueLength > 0 && (
            <p className="text-warning"><strong>Queue:</strong> {rateLimitStatus.queueLength} requests pending</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};