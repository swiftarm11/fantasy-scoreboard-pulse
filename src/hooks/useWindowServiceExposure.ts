import { useEffect } from 'react';
import { debugLogger } from '../utils/debugLogger';
import { hybridNFLDataService } from '../services/HybridNFLDataService';
import { eventAttributionService } from '../services/EventAttributionService';
import { eventStorageService } from '../services/EventStorageService';

/**
 * Hook to expose debugging services to window for easy console debugging
 * This helps developers trace the data flow from NFL events to dashboard display
 */
export const useWindowServiceExposure = () => {
  useEffect(() => {
    // 🔍 [DEBUG] Expose all live events services to window for debugging
    try {
      // Core services
      (window as any).hybridNFLDataService = hybridNFLDataService;
      (window as any).eventAttributionService = eventAttributionService;
      (window as any).eventStorageService = eventStorageService;
      (window as any).debugLogger = debugLogger;

      // Helper functions for quick debugging
      (window as any).liveEventsDebug = {
        // Quick status check
        getStatus: () => ({
          hybridNFL: hybridNFLDataService.getServiceStatus(),
          attribution: eventAttributionService.getCacheStats(),
          storage: eventStorageService.getCacheStats(),
          liveManager: (window as any).liveEventsManager?.state || 'Not initialized'
        }),

        // Force manual data refresh
        manualPoll: () => {
          debugLogger.info('DEBUG', 'Manual poll triggered from window');
          return hybridNFLDataService.manualPoll?.();
        },

        // Trigger test event for debugging
        testEvent: () => {
          debugLogger.info('DEBUG', 'Test event triggered from window');
          return (window as any).liveEventsManager?.triggerTestEvent?.();
        },

        // Check recent events
        getRecentEvents: () => {
          return (window as any).liveEventsManager?.recentEvents || [];
        },

        // Get attribution cache details
        getCacheDetails: () => ({
          attribution: eventAttributionService.getCacheStats(),
          storage: eventStorageService.getCacheStats()
        })
      };

      debugLogger.success('DEBUG', '🪟 All live events services exposed to window for debugging', {
        services: [
          'window.hybridNFLDataService',
          'window.eventAttributionService', 
          'window.eventStorageService',
          'window.debugLogger',
          'window.liveEventsDebug'
        ],
        quickCommands: [
          'window.liveEventsDebug.getStatus()',
          'window.liveEventsDebug.manualPoll()',
          'window.liveEventsDebug.testEvent()',
          'window.liveEventsDebug.getRecentEvents()'
        ]
      });

      console.log('🔍 Live Events Debug Console Ready!');
      console.log('Quick commands:');
      console.log('  window.liveEventsDebug.getStatus()     - Check all service statuses');
      console.log('  window.liveEventsDebug.manualPoll()    - Force refresh NFL data');
      console.log('  window.liveEventsDebug.testEvent()     - Trigger test scoring event');
      console.log('  window.liveEventsDebug.getRecentEvents() - View recent events');

    } catch (error) {
      debugLogger.error('DEBUG', 'Failed to expose services to window', error);
    }

    // Cleanup on unmount
    return () => {
      try {
        delete (window as any).hybridNFLDataService;
        delete (window as any).eventAttributionService;
        delete (window as any).eventStorageService;
        delete (window as any).liveEventsDebug;
        delete (window as any).liveEventsManager;
      } catch (error) {
        // Ignore cleanup errors
      }
    };
  }, []);
};