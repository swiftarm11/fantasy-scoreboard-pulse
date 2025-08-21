import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './alert-dialog';
import { AlertTriangle, Trash2, Settings, LogOut, RefreshCw } from 'lucide-react';

interface ConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'destructive' | 'warning' | 'info';
  icon?: React.ReactNode;
}

export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'destructive',
  icon
}) => {
  const getDefaultIcon = () => {
    switch (variant) {
      case 'destructive':
        return <AlertTriangle className="h-6 w-6 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="h-6 w-6 text-yellow-500" />;
      default:
        return <AlertTriangle className="h-6 w-6 text-blue-500" />;
    }
  };

  const getActionVariant = () => {
    switch (variant) {
      case 'destructive':
        return 'destructive';
      case 'warning':
        return 'default';
      default:
        return 'default';
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            {icon || getDefaultIcon()}
            <AlertDialogTitle className="text-left">{title}</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-left mt-2">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
          <AlertDialogCancel>{cancelText}</AlertDialogCancel>
          <AlertDialogAction 
            onClick={onConfirm}
            className={variant === 'destructive' ? 'bg-red-600 hover:bg-red-700 text-white' : ''}
          >
            {confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

// Preset confirmation dialogs for common actions
interface PresetConfirmationProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  itemName?: string;
}

export const DeleteLeagueConfirmation: React.FC<PresetConfirmationProps> = ({
  open,
  onOpenChange,
  onConfirm,
  itemName = 'league'
}) => (
  <ConfirmationDialog
    open={open}
    onOpenChange={onOpenChange}
    onConfirm={onConfirm}
    title="Remove League"
    description={`Are you sure you want to remove ${itemName} from your dashboard? This action cannot be undone.`}
    confirmText="Remove League"
    cancelText="Keep League"
    variant="destructive"
    icon={<Trash2 className="h-6 w-6 text-red-500" />}
  />
);

export const ResetSettingsConfirmation: React.FC<PresetConfirmationProps> = ({
  open,
  onOpenChange,
  onConfirm
}) => (
  <ConfirmationDialog
    open={open}
    onOpenChange={onOpenChange}
    onConfirm={onConfirm}
    title="Reset Settings"
    description="This will reset all your preferences to default values. Your league connections will remain intact."
    confirmText="Reset Settings"
    cancelText="Keep Settings"
    variant="warning"
    icon={<Settings className="h-6 w-6 text-yellow-500" />}
  />
);

export const DisconnectAccountConfirmation: React.FC<PresetConfirmationProps & { platform?: string }> = ({
  open,
  onOpenChange,
  onConfirm,
  platform = 'account'
}) => (
  <ConfirmationDialog
    open={open}
    onOpenChange={onOpenChange}
    onConfirm={onConfirm}
    title={`Disconnect ${platform}`}
    description={`This will remove your ${platform} connection and all associated leagues from your dashboard. You can reconnect later if needed.`}
    confirmText={`Disconnect ${platform}`}
    cancelText="Stay Connected"
    variant="warning"
    icon={<LogOut className="h-6 w-6 text-yellow-500" />}
  />
);

export const RefreshDataConfirmation: React.FC<PresetConfirmationProps> = ({
  open,
  onOpenChange,
  onConfirm
}) => (
  <ConfirmationDialog
    open={open}
    onOpenChange={onOpenChange}
    onConfirm={onConfirm}
    title="Refresh All Data"
    description="This will refresh data for all connected leagues. This might take a moment and will reset any cached information."
    confirmText="Refresh Data"
    cancelText="Cancel"
    variant="info"
    icon={<RefreshCw className="h-6 w-6 text-blue-500" />}
  />
);