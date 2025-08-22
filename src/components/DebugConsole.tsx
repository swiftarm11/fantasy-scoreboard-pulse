import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';
import { ChevronDown, Copy, Eye, EyeOff } from 'lucide-react';
import { yahooOAuth } from '../utils/yahooOAuth';
import { toast } from './ui/use-toast';

interface DebugInfo {
  envVars: {
    VITE_YAHOO_CLIENT_ID: string;
    VITE_YAHOO_REDIRECT_URI: string;
    VITE_SUPABASE_URL: string;
    VITE_SUPABASE_ANON_KEY: string;
  };
  yahooConfig: {
    isValid: boolean;
    missing: string[];
  };
  yahooOAuthStatus: {
    isConfigured: boolean;
    isConnected: boolean;
  };
  currentUrl: string;
  userAgent: string;
}

export const DebugConsole = () => {
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [showSensitive, setShowSensitive] = useState(false);

  useEffect(() => {
    // Gather all debug information
    const gatherDebugInfo = (): DebugInfo => {
      const yahooConfig = yahooOAuth.getConfigurationStatus();
      
      return {
        envVars: {
          VITE_YAHOO_CLIENT_ID: import.meta.env.VITE_YAHOO_CLIENT_ID || 'NOT SET',
          VITE_YAHOO_REDIRECT_URI: import.meta.env.VITE_YAHOO_REDIRECT_URI || 'NOT SET',
          VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL || 'NOT SET',
          VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY ? 'SET' : 'NOT SET'
        },
        yahooConfig,
        yahooOAuthStatus: {
          isConfigured: yahooOAuth.isConfigured(),
          isConnected: yahooOAuth.isConnected()
        },
        currentUrl: window.location.href,
        userAgent: navigator.userAgent
      };
    };

    const info = gatherDebugInfo();
    setDebugInfo(info);

    // Console logging for development
    console.log('=== YAHOO OAUTH DEBUG INFO ===');
    console.log('Environment Variables Status (PKCE Public App):', {
      VITE_YAHOO_CLIENT_ID: info.envVars.VITE_YAHOO_CLIENT_ID !== 'NOT SET' ? 'SET' : 'MISSING',
      VITE_YAHOO_REDIRECT_URI: info.envVars.VITE_YAHOO_REDIRECT_URI,
      VITE_SUPABASE_ANON_KEY: info.envVars.VITE_SUPABASE_ANON_KEY,
      NOTE: 'Client secret not required for PKCE public app'
    });

    if (showSensitive) {
      console.log('Actual Values (first 20 chars only for security):');
      console.log('CLIENT_ID:', info.envVars.VITE_YAHOO_CLIENT_ID?.substring(0, 20) + '...');
      console.log('REDIRECT_URI:', info.envVars.VITE_YAHOO_REDIRECT_URI);
    }

    console.log('Yahoo OAuth Config Status:', info.yahooConfig);
    console.log('Yahoo OAuth isConfigured():', info.yahooOAuthStatus.isConfigured);
    console.log('Yahoo OAuth isConnected():', info.yahooOAuthStatus.isConnected);
    console.log('=== END DEBUG INFO ===');

    // Expose debug info to window in development
    if (import.meta.env.DEV) {
      (window as any).debugYahoo = {
        envVars: info.envVars,
        yahooOAuth: yahooOAuth,
        testConfig: () => console.log('Config test:', yahooOAuth.getConfigurationStatus()),
        fullDebugInfo: info
      };
      console.log('Debug info available at window.debugYahoo');
    }
  }, [showSensitive]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({
        title: 'Copied to clipboard',
        description: 'Debug information copied successfully'
      });
    });
  };

  const getStatusBadge = (status: string | boolean) => {
    if (typeof status === 'boolean') {
      return (
        <Badge variant={status ? 'default' : 'destructive'}>
          {status ? 'YES' : 'NO'}
        </Badge>
      );
    }
    
    const isGood = status === 'SET' || status !== 'NOT SET';
    return (
      <Badge variant={isGood ? 'default' : 'destructive'}>
        {status}
      </Badge>
    );
  };

  const formatValue = (key: string, value: string) => {
    if (!showSensitive && (key.includes('ID') || key.includes('KEY'))) {
      if (value === 'NOT SET') return value;
      if (value === 'SET') return value;
      return value.substring(0, 8) + '...';
    }
    return value;
  };

  if (!debugInfo) return null;

  // Only show in development or when there are configuration issues
  const shouldShow = import.meta.env.DEV || !debugInfo.yahooConfig.isValid || !debugInfo.yahooOAuthStatus.isConfigured;
  
  if (!shouldShow) return null;

  return (
    <Card className="fixed bottom-4 right-4 w-96 max-h-96 overflow-auto z-50 shadow-lg">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <CardTitle className="flex items-center justify-between text-sm">
              Yahoo OAuth Debug Console
              <div className="flex items-center gap-2">
                {!debugInfo.yahooConfig.isValid && (
                  <Badge variant="destructive" className="text-xs">Issues Found</Badge>
                )}
                <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </div>
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="space-y-4 text-xs">
            {/* Environment Variables */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold">Environment Variables</h4>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowSensitive(!showSensitive)}
                  className="h-6 w-6 p-0"
                >
                  {showSensitive ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                </Button>
              </div>
              <div className="space-y-1">
                {Object.entries(debugInfo.envVars).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="font-mono text-xs">{key}:</span>
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-xs">{formatValue(key, value)}</span>
                      {getStatusBadge(value)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Configuration Status */}
            <div>
              <h4 className="font-semibold mb-2">Configuration Status</h4>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span>Valid Configuration:</span>
                  {getStatusBadge(debugInfo.yahooConfig.isValid)}
                </div>
                <div className="flex items-center justify-between">
                  <span>OAuth Configured:</span>
                  {getStatusBadge(debugInfo.yahooOAuthStatus.isConfigured)}
                </div>
                <div className="flex items-center justify-between">
                  <span>Currently Connected:</span>
                  {getStatusBadge(debugInfo.yahooOAuthStatus.isConnected)}
                </div>
              </div>
              
              {debugInfo.yahooConfig.missing.length > 0 && (
                <div className="mt-2 p-2 bg-destructive/10 rounded">
                  <p className="text-destructive font-semibold">Missing Variables:</p>
                  <ul className="list-disc list-inside text-destructive">
                    {debugInfo.yahooConfig.missing.map(missing => (
                      <li key={missing} className="font-mono">{missing}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* System Info */}
            <div>
              <h4 className="font-semibold mb-2">System Info</h4>
              <div className="space-y-1">
                <div>
                  <span className="font-semibold">Current URL:</span>
                  <p className="font-mono text-xs break-all">{debugInfo.currentUrl}</p>
                </div>
                <div>
                  <span className="font-semibold">Environment:</span>
                  <Badge variant="outline">{import.meta.env.DEV ? 'Development' : 'Production'}</Badge>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => copyToClipboard(JSON.stringify(debugInfo, null, 2))}
                className="flex-1"
              >
                <Copy className="h-3 w-3 mr-1" />
                Copy Debug Info
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => console.log('Full Debug Info:', debugInfo)}
                className="flex-1"
              >
                Log to Console
              </Button>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};