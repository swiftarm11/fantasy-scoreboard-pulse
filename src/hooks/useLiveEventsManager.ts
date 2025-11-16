// src/hooks/useLiveEventsManager.ts
import { useEffect, useRef } from 'react';
import { tank01NFLDataService } from '@/services/Tank01NFLDataService';
import { eventAttributionService } from '@/services/EventAttributionService';
import { eventStorageService } from '@/services/EventStorageService';
import { debugLogger } from '@/utils/debugLogger';

export interface LiveEventsManagerState {
  isActive: boolean;
  connectedLeagues: number;
  lastEventTime: string | null;
  status: string;
  eventCount: number;
}

export const useLiveEventsManager = () => {
  const isInitialized = useRef(false);

  useEffect(() => {
    if (isInitialized.current) return;
    
    debugLogger.info('LIVEMANAGER', 'Initializing live events manager...');
    
    // Create the live events manager object with ALL required methods
    const manager = {
      _isActive: false,
      _connectedLeagues: 0,
      _lastEventTime: null as string | null,
      _eventCount: 0,
      
      getState: (): LiveEventsManagerState => {
        const stats = eventStorageService.getCacheStats();
        return {
          isActive: manager._isActive,
          connectedLeagues: manager._connectedLeagues,
          lastEventTime: stats.newestEvent || null,
          status: manager._isActive ? 'Active' : 'Inactive',
          eventCount: stats.totalEvents || 0
        };
      },
      
      startSystem: async (): Promise<void> => {
        debugLogger.info('LIVEMANAGER', 'Starting live events system...');
        
        try {
          // Start Tank01 polling
          await tank01NFLDataService.startPolling();
          debugLogger.success('LIVEMANAGER', 'Tank01 polling started');
          
          // Register scoring event callback
          tank01NFLDataService.onScoringEvent((event) => {
            debugLogger.info('LIVEMANAGER', 'Scoring event detected', event);
            manager._lastEventTime = new Date().toISOString();
            manager._eventCount++;
            
            // Attribute event to leagues (attribution service handles storage)
            eventAttributionService.attributeEvent(event);
          });
          
          manager._isActive = true;
          debugLogger.success('LIVEMANAGER', 'Live events system started successfully');
        } catch (error) {
          debugLogger.error('LIVEMANAGER', 'Failed to start system', error);
          throw error;
        }
      },
      
      stopSystem: (): void => {
        tank01NFLDataService.stopPolling();
        manager._isActive = false;
        manager._eventCount = 0;
        debugLogger.info('LIVEMANAGER', 'Live events system stopped');
      },
      
      refreshRosters: async (): Promise<void> => {
        debugLogger.info('LIVEMANAGER', 'Roster refresh requested - handled by dashboard hook');
        // Rosters are managed by useFantasyDashboardWithLiveEvents
        // This is just a placeholder for manual refresh triggers
      },
      
      getCacheStats: () => {
        return eventStorageService.getCacheStats();
      },
      
      triggerTestEvent: () => {
        debugLogger.info('LIVEMANAGER', 'Test event triggered');
        const testEvent = {
          playerId: '4040715', // Lamar Jackson
          playerName: 'Lamar Jackson',
          team: 'BAL',
          eventType: 'passing_td' as const,
          fantasyPoints: 4,
          timestamp: new Date().toISOString(),
          gameId: 'TEST_GAME',
          description: 'TEST: 25-yard touchdown pass'
        };
        
        eventAttributionService.attributeEvent(testEvent);
      }
    };
    
    // Expose to window for debugging
    (window as any).liveEventsManager = manager;
    
    debugLogger.success('LIVEMANAGER', 'Manager initialized and exposed to window');
    console.log('✅ window.liveEventsManager ready with methods:', Object.keys(manager));
    
    isInitialized.current = true;
    
    // Cleanup on unmount
    return () => {
      if (manager._isActive) {
        manager.stopSystem();
      }
    };
  }, []);
  
  return null;
};
