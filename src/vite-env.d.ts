/// <reference types="vite/client" />

interface Window {
  yahooOAuth: any;
  appEnv: {
    YAHOO_CLIENT_ID: string;
    YAHOO_REDIRECT_URI: string;
    YAHOO_SIMULATION: string;
  };
  debugYahoo?: any;
}
