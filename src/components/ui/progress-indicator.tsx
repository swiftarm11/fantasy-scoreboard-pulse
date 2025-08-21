import React from 'react';
import { CheckCircle, Circle, Loader2 } from 'lucide-react';
import { Progress } from './progress';

interface Step {
  id: string;
  label: string;
  description?: string;
  status: 'pending' | 'active' | 'completed' | 'error';
}

interface ProgressIndicatorProps {
  steps: Step[];
  currentStep?: string;
  showProgress?: boolean;
  progressValue?: number;
  className?: string;
}

export const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({
  steps,
  currentStep,
  showProgress = false,
  progressValue = 0,
  className = ''
}) => {
  const currentStepIndex = steps.findIndex(step => step.id === currentStep);
  const completedSteps = steps.filter(step => step.status === 'completed').length;
  const totalSteps = steps.length;

  const getStepIcon = (step: Step, index: number) => {
    switch (step.status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'active':
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'error':
        return <Circle className="w-5 h-5 text-red-500" />;
      default:
        return <Circle className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStepTextColor = (step: Step) => {
    switch (step.status) {
      case 'completed':
        return 'text-green-700 dark:text-green-300';
      case 'active':
        return 'text-blue-700 dark:text-blue-300';
      case 'error':
        return 'text-red-700 dark:text-red-300';
      default:
        return 'text-gray-500 dark:text-gray-400';
    }
  };

  return (
    <div className={`progress-indicator ${className}`}>
      {/* Overall Progress Bar */}
      {showProgress && (
        <div className="mb-6">
          <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
            <span>Progress</span>
            <span>{Math.round((completedSteps / totalSteps) * 100)}%</span>
          </div>
          <Progress 
            value={progressValue || (completedSteps / totalSteps) * 100} 
            className="h-2"
          />
        </div>
      )}

      {/* Step List */}
      <div className="space-y-4">
        {steps.map((step, index) => (
          <div
            key={step.id}
            className={`flex items-start gap-3 transition-all duration-300 ${
              step.status === 'active' ? 'animate-pulse' : ''
            }`}
          >
            {/* Step Icon */}
            <div className="flex-shrink-0 mt-0.5">
              {getStepIcon(step, index)}
            </div>

            {/* Step Content */}
            <div className="flex-1 min-w-0">
              <div className={`font-medium ${getStepTextColor(step)}`}>
                {step.label}
              </div>
              {step.description && (
                <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {step.description}
                </div>
              )}
            </div>

            {/* Connection Line */}
            {index < steps.length - 1 && (
              <div
                className={`absolute left-[10px] mt-6 w-0.5 h-4 ${
                  step.status === 'completed'
                    ? 'bg-green-300'
                    : step.status === 'active'
                    ? 'bg-blue-300'
                    : 'bg-gray-300'
                } transition-colors duration-300`}
                style={{ transform: 'translateX(50%)' }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// Preset configurations for common workflows
export const createOAuthSteps = (currentStep?: string): Step[] => [
  {
    id: 'init',
    label: 'Initializing OAuth',
    description: 'Setting up authentication...',
    status: currentStep === 'init' ? 'active' : currentStep ? 'completed' : 'pending'
  },
  {
    id: 'redirect',
    label: 'Redirecting to Provider',
    description: 'Opening authentication page...',
    status: currentStep === 'redirect' ? 'active' : 
            ['init'].includes(currentStep || '') ? 'completed' : 'pending'
  },
  {
    id: 'callback',
    label: 'Processing Callback',
    description: 'Validating credentials...',
    status: currentStep === 'callback' ? 'active' : 
            ['init', 'redirect'].includes(currentStep || '') ? 'completed' : 'pending'
  },
  {
    id: 'complete',
    label: 'Authentication Complete',
    description: 'Ready to fetch data...',
    status: currentStep === 'complete' ? 'completed' : 
            ['init', 'redirect', 'callback'].includes(currentStep || '') ? 'completed' : 'pending'
  }
];

export const createDataFetchSteps = (platform: string, currentStep?: string): Step[] => [
  {
    id: 'connect',
    label: `Connecting to ${platform}`,
    description: 'Establishing API connection...',
    status: currentStep === 'connect' ? 'active' : currentStep ? 'completed' : 'pending'
  },
  {
    id: 'leagues',
    label: 'Fetching Leagues',
    description: 'Loading your league information...',
    status: currentStep === 'leagues' ? 'active' : 
            ['connect'].includes(currentStep || '') ? 'completed' : 'pending'
  },
  {
    id: 'matchups',
    label: 'Loading Matchups',
    description: 'Getting current week data...',
    status: currentStep === 'matchups' ? 'active' : 
            ['connect', 'leagues'].includes(currentStep || '') ? 'completed' : 'pending'
  },
  {
    id: 'complete',
    label: 'Data Ready',
    description: 'All information loaded successfully',
    status: currentStep === 'complete' ? 'completed' : 
            ['connect', 'leagues', 'matchups'].includes(currentStep || '') ? 'completed' : 'pending'
  }
];