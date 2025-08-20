import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { toast } from './ui/use-toast';
import { Download, Share2, FileText, Camera, Loader2 } from 'lucide-react';
import html2canvas from 'html2canvas';
import { saveAs } from 'file-saver';

interface ExportShareModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dashboardData?: any;
}

export const ExportShareModal = ({ open, onOpenChange, dashboardData }: ExportShareModalProps) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationType, setGenerationType] = useState<'screenshot' | 'summary' | null>(null);

  const generateScreenshot = async () => {
    setIsGenerating(true);
    setGenerationType('screenshot');
    
    try {
      // Hide modal temporarily
      onOpenChange(false);
      
      // Wait for modal to close
      await new Promise(resolve => setTimeout(resolve, 300));
      
      const dashboardElement = document.querySelector('.dashboard-container') || document.body;
      
      const canvas = await html2canvas(dashboardElement as HTMLElement, {
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#0f172a',
        scale: 2,
        width: 1920,
        height: 1080,
        scrollX: 0,
        scrollY: 0,
      });

      canvas.toBlob((blob) => {
        if (blob) {
          const timestamp = new Date().toISOString().slice(0, 16).replace(/:/g, '-');
          saveAs(blob, `fantasy-dashboard-${timestamp}.png`);
          
          toast({
            title: 'Screenshot Saved',
            description: 'Dashboard screenshot has been downloaded',
          });
        }
      }, 'image/png');
      
    } catch (error) {
      console.error('Screenshot generation failed:', error);
      toast({
        title: 'Screenshot Failed',
        description: 'Unable to generate screenshot. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
      setGenerationType(null);
      // Reopen modal
      setTimeout(() => onOpenChange(true), 100);
    }
  };

  const generateWeeklySummary = async () => {
    setIsGenerating(true);
    setGenerationType('summary');
    
    try {
      if (!dashboardData?.leagues?.length) {
        throw new Error('No league data available');
      }

      const summary = generateTextSummary(dashboardData);
      
      const blob = new Blob([summary], { type: 'text/plain;charset=utf-8' });
      const timestamp = new Date().toISOString().slice(0, 16).replace(/:/g, '-');
      saveAs(blob, `fantasy-weekly-summary-${timestamp}.txt`);
      
      toast({
        title: 'Summary Generated',
        description: 'Weekly summary has been downloaded',
      });
      
    } catch (error) {
      console.error('Summary generation failed:', error);
      toast({
        title: 'Summary Failed',
        description: 'Unable to generate weekly summary. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
      setGenerationType(null);
    }
  };

  const generateTextSummary = (data: any): string => {
    const currentWeek = data.nflState?.week || 'Unknown';
    const timestamp = new Date().toLocaleString();
    
    let summary = `FANTASY FOOTBALL WEEKLY SUMMARY - Week ${currentWeek}\n`;
    summary += `Generated: ${timestamp}\n`;
    summary += `${'='.repeat(60)}\n\n`;

    data.leagues.forEach((league: any, index: number) => {
      summary += `LEAGUE ${index + 1}: ${league.name || 'Unknown League'}\n`;
      summary += `Platform: ${league.platform || 'Unknown'}\n`;
      summary += `League ID: ${league.leagueId}\n`;
      
      if (league.userTeam) {
        summary += `Your Team: ${league.userTeam.teamName || league.userTeam.ownerName || 'Unknown'}\n`;
        summary += `Current Score: ${league.userTeam.currentScore || 0} points\n`;
        summary += `Record: ${league.userTeam.wins || 0}-${league.userTeam.losses || 0}-${league.userTeam.ties || 0}\n`;
        
        if (league.currentMatchup) {
          const opponent = league.currentMatchup.opponent;
          summary += `This Week vs: ${opponent?.teamName || opponent?.ownerName || 'Unknown'}\n`;
          summary += `Score: ${league.userTeam.currentScore || 0} - ${opponent?.currentScore || 0}\n`;
          
          const leadingBy = (league.userTeam.currentScore || 0) - (opponent?.currentScore || 0);
          if (leadingBy > 0) {
            summary += `Status: Leading by ${leadingBy.toFixed(1)} points\n`;
          } else if (leadingBy < 0) {
            summary += `Status: Trailing by ${Math.abs(leadingBy).toFixed(1)} points\n`;
          } else {
            summary += `Status: Tied\n`;
          }
        }
        
        if (league.recentEvents?.length) {
          summary += `Recent Activity:\n`;
          league.recentEvents.slice(0, 3).forEach((event: any) => {
            summary += `  - ${event.playerName}: ${event.description} (${event.points > 0 ? '+' : ''}${event.points} pts)\n`;
          });
        }
      }
      
      summary += `\n${'-'.repeat(40)}\n\n`;
    });

    summary += `\nOVERALL PERFORMANCE:\n`;
    const totalLeagues = data.leagues.length;
    const winningLeagues = data.leagues.filter((l: any) => {
      if (!l.currentMatchup) return false;
      const userScore = l.userTeam?.currentScore || 0;
      const oppScore = l.currentMatchup.opponent?.currentScore || 0;
      return userScore > oppScore;
    }).length;
    
    summary += `Total Leagues: ${totalLeagues}\n`;
    summary += `Currently Winning: ${winningLeagues}/${totalLeagues}\n`;
    summary += `Win Rate This Week: ${totalLeagues > 0 ? ((winningLeagues / totalLeagues) * 100).toFixed(1) : 0}%\n`;

    return summary;
  };

  const shareToClipboard = async () => {
    try {
      const url = window.location.href;
      await navigator.clipboard.writeText(url);
      
      toast({
        title: 'Link Copied',
        description: 'Dashboard link copied to clipboard',
      });
    } catch (error) {
      toast({
        title: 'Copy Failed',
        description: 'Unable to copy link to clipboard',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Export & Share Dashboard</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Camera className="h-5 w-5" />
                Screenshot
              </CardTitle>
              <CardDescription>
                Generate a high-quality image of your dashboard
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                onClick={generateScreenshot} 
                disabled={isGenerating}
                className="w-full"
                variant="outline"
              >
                {isGenerating && generationType === 'screenshot' ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Download PNG
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Weekly Summary
              </CardTitle>
              <CardDescription>
                Generate a text summary of all league performance
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                onClick={generateWeeklySummary} 
                disabled={isGenerating || !dashboardData?.leagues?.length}
                className="w-full"
                variant="outline"
              >
                {isGenerating && generationType === 'summary' ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Download Summary
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Share2 className="h-5 w-5" />
                Share Dashboard
              </CardTitle>
              <CardDescription>
                Share your dashboard with others
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                onClick={shareToClipboard} 
                className="w-full"
                variant="outline"
              >
                <Share2 className="h-4 w-4 mr-2" />
                Copy Dashboard Link
              </Button>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
};