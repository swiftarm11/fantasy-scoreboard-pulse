import type { Platform } from '../types/fantasy';

// Scoring event interface for calculations
export interface ScoringEventData {
  type: string;
  player: {
    id: string;
    name: string;
    position: string;
    team: string;
  };
  stats: {
    passingYards?: number;
    passingTDs?: number;
    interceptions?: number;
    rushingYards?: number;
    rushingTDs?: number;
    receivingYards?: number;
    receivingTDs?: number;
    receptions?: number;
    fumbles?: number;
    fieldGoalsMade?: number;
    fieldGoalDistance?: number;
    extraPointsMade?: number;
    defensePoints?: number;
    defenseTDs?: number;
    sacks?: number;
    interceptionTDs?: number;
    fumbleRecoveries?: number;
    safeties?: number;
  };
}

// Platform-specific scoring settings
export interface YahooScoringSettings {
  passingYards: number;
  passingTDs: number;
  interceptions: number;
  rushingYards: number;
  rushingTDs: number;
  receivingYards: number;
  receivingTDs: number;
  receptions: number;
  fumbles: number;
  fieldGoals: Record<string, number>; // distance ranges
  extraPoints: number;
  defensePoints: Record<string, number>; // points allowed ranges
  defenseTDs: number;
  sacks: number;
  interceptionTDs: number;
  fumbleRecoveries: number;
  safeties: number;
  bonuses: {
    passingYards: Array<{ threshold: number; points: number }>;
    rushingYards: Array<{ threshold: number; points: number }>;
    receivingYards: Array<{ threshold: number; points: number }>;
  };
}

export interface SleeperScoringSettings {
  [key: string]: number; // Dynamic scoring rules from Sleeper API
}

export interface CalculationResult {
  totalPoints: number;
  breakdown: Array<{
    category: string;
    points: number;
    description: string;
  }>;
}

export class FantasyPointsCalculator {
  private static instance: FantasyPointsCalculator;

  // Yahoo Standard NFL Scoring Rules
  private readonly YAHOO_STANDARD: YahooScoringSettings = {
    passingYards: 0.04, // 1 point per 25 yards
    passingTDs: 4,
    interceptions: -1,
    rushingYards: 0.1, // 1 point per 10 yards
    rushingTDs: 6,
    receivingYards: 0.1, // 1 point per 10 yards
    receivingTDs: 6,
    receptions: 0.5, // PPR (half point)
    fumbles: -2,
    fieldGoals: {
      '0-39': 3,
      '40-49': 4,
      '50+': 5
    },
    extraPoints: 1,
    defensePoints: {
      '0': 10,
      '1-6': 7,
      '7-13': 4,
      '14-20': 1,
      '21-27': 0,
      '28-34': -1,
      '35+': -4
    },
    defenseTDs: 6,
    sacks: 1,
    interceptionTDs: 6,
    fumbleRecoveries: 2,
    safeties: 2,
    bonuses: {
      passingYards: [
        { threshold: 300, points: 2 },
        { threshold: 400, points: 3 }
      ],
      rushingYards: [
        { threshold: 100, points: 2 },
        { threshold: 200, points: 3 }
      ],
      receivingYards: [
        { threshold: 100, points: 2 },
        { threshold: 200, points: 3 }
      ]
    }
  };

  public static getInstance(): FantasyPointsCalculator {
    if (!FantasyPointsCalculator.instance) {
      FantasyPointsCalculator.instance = new FantasyPointsCalculator();
    }
    return FantasyPointsCalculator.instance;
  }

  /**
   * Calculate points using Yahoo standard scoring rules
   */
  public calculateYahooStandard(event: ScoringEventData): CalculationResult {
    return this.calculateWithSettings(event, this.YAHOO_STANDARD, 'yahoo');
  }

  /**
   * Calculate points using Sleeper custom scoring rules
   */
  public calculateSleeperCustom(
    event: ScoringEventData, 
    scoringSettings: SleeperScoringSettings
  ): CalculationResult {
    const breakdown: Array<{ category: string; points: number; description: string }> = [];
    let totalPoints = 0;

    const { stats } = event;

    // Process Sleeper scoring settings dynamically
    Object.entries(scoringSettings).forEach(([statKey, pointValue]) => {
      const statValue = this.getStatValue(stats, statKey);
      if (statValue && statValue > 0) {
        const points = statValue * pointValue;
        totalPoints += points;
        breakdown.push({
          category: this.formatStatKey(statKey),
          points,
          description: `${statValue} × ${pointValue} = ${points}`
        });
      }
    });

    return { totalPoints, breakdown };
  }

  /**
   * Unified interface for calculating points across platforms
   */
  public calculatePoints(
    event: ScoringEventData,
    platform: Platform,
    scoringSettings?: YahooScoringSettings | SleeperScoringSettings
  ): CalculationResult {
    switch (platform) {
      case 'Yahoo':
        return this.calculateYahooStandard(event);
      
      case 'Sleeper':
        if (!scoringSettings) {
          throw new Error('Sleeper requires custom scoring settings');
        }
        return this.calculateSleeperCustom(event, scoringSettings as SleeperScoringSettings);
      
      default:
        // Default to Yahoo standard for other platforms
        return this.calculateYahooStandard(event);
    }
  }

  /**
   * Calculate points with specific settings (used internally)
   */
  private calculateWithSettings(
    event: ScoringEventData,
    settings: YahooScoringSettings,
    platform: string
  ): CalculationResult {
    const breakdown: Array<{ category: string; points: number; description: string }> = [];
    let totalPoints = 0;

    const { stats } = event;

    // Passing stats
    if (stats.passingYards) {
      const points = stats.passingYards * settings.passingYards;
      totalPoints += points;
      breakdown.push({
        category: 'Passing Yards',
        points,
        description: `${stats.passingYards} yards × ${settings.passingYards} = ${points}`
      });
    }

    if (stats.passingTDs) {
      const points = stats.passingTDs * settings.passingTDs;
      totalPoints += points;
      breakdown.push({
        category: 'Passing TDs',
        points,
        description: `${stats.passingTDs} TDs × ${settings.passingTDs} = ${points}`
      });
    }

    if (stats.interceptions) {
      const points = stats.interceptions * settings.interceptions;
      totalPoints += points;
      breakdown.push({
        category: 'Interceptions',
        points,
        description: `${stats.interceptions} INTs × ${settings.interceptions} = ${points}`
      });
    }

    // Rushing stats
    if (stats.rushingYards) {
      const points = stats.rushingYards * settings.rushingYards;
      totalPoints += points;
      breakdown.push({
        category: 'Rushing Yards',
        points,
        description: `${stats.rushingYards} yards × ${settings.rushingYards} = ${points}`
      });
    }

    if (stats.rushingTDs) {
      const points = stats.rushingTDs * settings.rushingTDs;
      totalPoints += points;
      breakdown.push({
        category: 'Rushing TDs',
        points,
        description: `${stats.rushingTDs} TDs × ${settings.rushingTDs} = ${points}`
      });
    }

    // Receiving stats
    if (stats.receivingYards) {
      const points = stats.receivingYards * settings.receivingYards;
      totalPoints += points;
      breakdown.push({
        category: 'Receiving Yards',
        points,
        description: `${stats.receivingYards} yards × ${settings.receivingYards} = ${points}`
      });
    }

    if (stats.receivingTDs) {
      const points = stats.receivingTDs * settings.receivingTDs;
      totalPoints += points;
      breakdown.push({
        category: 'Receiving TDs',
        points,
        description: `${stats.receivingTDs} TDs × ${settings.receivingTDs} = ${points}`
      });
    }

    if (stats.receptions) {
      const points = stats.receptions * settings.receptions;
      totalPoints += points;
      breakdown.push({
        category: 'Receptions',
        points,
        description: `${stats.receptions} catches × ${settings.receptions} = ${points}`
      });
    }

    // Fumbles
    if (stats.fumbles) {
      const points = stats.fumbles * settings.fumbles;
      totalPoints += points;
      breakdown.push({
        category: 'Fumbles',
        points,
        description: `${stats.fumbles} fumbles × ${settings.fumbles} = ${points}`
      });
    }

    // Kicking stats
    if (stats.fieldGoalsMade && stats.fieldGoalDistance) {
      const distance = stats.fieldGoalDistance;
      let fieldGoalPoints = 0;
      
      if (distance < 40) {
        fieldGoalPoints = settings.fieldGoals['0-39'];
      } else if (distance < 50) {
        fieldGoalPoints = settings.fieldGoals['40-49'];
      } else {
        fieldGoalPoints = settings.fieldGoals['50+'];
      }
      
      const points = stats.fieldGoalsMade * fieldGoalPoints;
      totalPoints += points;
      breakdown.push({
        category: 'Field Goals',
        points,
        description: `${stats.fieldGoalsMade} FG (${distance}yd) × ${fieldGoalPoints} = ${points}`
      });
    }

    if (stats.extraPointsMade) {
      const points = stats.extraPointsMade * settings.extraPoints;
      totalPoints += points;
      breakdown.push({
        category: 'Extra Points',
        points,
        description: `${stats.extraPointsMade} XP × ${settings.extraPoints} = ${points}`
      });
    }

    // Defense stats
    if (stats.defenseTDs) {
      const points = stats.defenseTDs * settings.defenseTDs;
      totalPoints += points;
      breakdown.push({
        category: 'Defensive TDs',
        points,
        description: `${stats.defenseTDs} TDs × ${settings.defenseTDs} = ${points}`
      });
    }

    if (stats.sacks) {
      const points = stats.sacks * settings.sacks;
      totalPoints += points;
      breakdown.push({
        category: 'Sacks',
        points,
        description: `${stats.sacks} sacks × ${settings.sacks} = ${points}`
      });
    }

    if (stats.interceptionTDs) {
      const points = stats.interceptionTDs * settings.interceptionTDs;
      totalPoints += points;
      breakdown.push({
        category: 'INT TDs',
        points,
        description: `${stats.interceptionTDs} INT TDs × ${settings.interceptionTDs} = ${points}`
      });
    }

    if (stats.fumbleRecoveries) {
      const points = stats.fumbleRecoveries * settings.fumbleRecoveries;
      totalPoints += points;
      breakdown.push({
        category: 'Fumble Recoveries',
        points,
        description: `${stats.fumbleRecoveries} recoveries × ${settings.fumbleRecoveries} = ${points}`
      });
    }

    if (stats.safeties) {
      const points = stats.safeties * settings.safeties;
      totalPoints += points;
      breakdown.push({
        category: 'Safeties',
        points,
        description: `${stats.safeties} safeties × ${settings.safeties} = ${points}`
      });
    }

    // Bonus calculations
    totalPoints += this.calculateBonuses(stats, settings, breakdown);

    return {
      totalPoints: Math.round(totalPoints * 100) / 100, // Round to 2 decimal places
      breakdown
    };
  }

  /**
   * Calculate bonus points for yard thresholds
   */
  private calculateBonuses(
    stats: ScoringEventData['stats'],
    settings: YahooScoringSettings,
    breakdown: Array<{ category: string; points: number; description: string }>
  ): number {
    let bonusPoints = 0;

    // Passing yard bonuses
    if (stats.passingYards) {
      settings.bonuses.passingYards.forEach(bonus => {
        if (stats.passingYards! >= bonus.threshold) {
          bonusPoints += bonus.points;
          breakdown.push({
            category: 'Passing Bonus',
            points: bonus.points,
            description: `${bonus.threshold}+ passing yards bonus`
          });
        }
      });
    }

    // Rushing yard bonuses
    if (stats.rushingYards) {
      settings.bonuses.rushingYards.forEach(bonus => {
        if (stats.rushingYards! >= bonus.threshold) {
          bonusPoints += bonus.points;
          breakdown.push({
            category: 'Rushing Bonus',
            points: bonus.points,
            description: `${bonus.threshold}+ rushing yards bonus`
          });
        }
      });
    }

    // Receiving yard bonuses
    if (stats.receivingYards) {
      settings.bonuses.receivingYards.forEach(bonus => {
        if (stats.receivingYards! >= bonus.threshold) {
          bonusPoints += bonus.points;
          breakdown.push({
            category: 'Receiving Bonus',
            points: bonus.points,
            description: `${bonus.threshold}+ receiving yards bonus`
          });
        }
      });
    }

    return bonusPoints;
  }

  /**
   * Get stat value from stats object using Sleeper key format
   */
  private getStatValue(stats: ScoringEventData['stats'], statKey: string): number {
    const mappings: Record<string, keyof ScoringEventData['stats']> = {
      'pass_yd': 'passingYards',
      'pass_td': 'passingTDs',
      'pass_int': 'interceptions',
      'rush_yd': 'rushingYards',
      'rush_td': 'rushingTDs',
      'rec_yd': 'receivingYards',
      'rec_td': 'receivingTDs',
      'rec': 'receptions',
      'fum_lost': 'fumbles',
      'fgm': 'fieldGoalsMade',
      'xpm': 'extraPointsMade',
      'def_td': 'defenseTDs',
      'sack': 'sacks',
      'int_td': 'interceptionTDs',
      'fum_rec': 'fumbleRecoveries',
      'safe': 'safeties'
    };

    const mappedKey = mappings[statKey];
    return mappedKey ? (stats[mappedKey] || 0) : 0;
  }

  /**
   * Format stat key for display
   */
  private formatStatKey(statKey: string): string {
    const displayNames: Record<string, string> = {
      'pass_yd': 'Passing Yards',
      'pass_td': 'Passing TDs',
      'pass_int': 'Interceptions',
      'rush_yd': 'Rushing Yards',
      'rush_td': 'Rushing TDs',
      'rec_yd': 'Receiving Yards',
      'rec_td': 'Receiving TDs',
      'rec': 'Receptions',
      'fum_lost': 'Fumbles Lost',
      'fgm': 'Field Goals Made',
      'xpm': 'Extra Points Made',
      'def_td': 'Defensive TDs',
      'sack': 'Sacks',
      'int_td': 'Interception TDs',
      'fum_rec': 'Fumble Recoveries',
      'safe': 'Safeties'
    };

    return displayNames[statKey] || statKey;
  }
}

// Export singleton instance
export const fantasyPointsCalculator = FantasyPointsCalculator.getInstance();