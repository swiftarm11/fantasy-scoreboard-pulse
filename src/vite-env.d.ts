/// <reference types="vite/client" />

declare global {
  interface Window {
    // Yahoo OAuth services
    yahooOAuth: any;
    appEnv: {
      YAHOO_CLIENT_ID: string;
      YAHOO_REDIRECT_URI: string;
      YAHOO_SIMULATION: string;
    };
    debugYahoo?: any;
    
    // Live Events services for debugging
    hybridNFLDataService?: any;
    eventAttributionService?: any;
    eventStorageService?: any;
    debugLogger?: any;
    liveEventsManager?: {
      getState: () => any;
      getRecentEvents: () => any[];
      startSystem: () => Promise<void>;
      stopSystem: () => void;
      refreshRosters: () => Promise<void>;
      getLeagueEvents: (leagueId: string) => any[];
      triggerTestEvent: () => void;
      getCacheStats: () => any;
    };
    liveEventsDebug?: {
      getStatus: () => any;
      manualPoll: () => Promise<void> | undefined;
      testEvent: () => void | undefined;
      getRecentEvents: () => any[];
      getCacheDetails: () => any;
    };
  }
}
