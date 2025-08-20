import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from './ui/sheet'
import { Button } from './ui/button'
import { Menu, Settings } from 'lucide-react'
import { SettingsModal } from './SettingsModal'
import { useState } from 'react'
import { useIsMobile } from '../hooks/use-mobile'

interface MobileSettingsModalProps {
  children?: React.ReactNode
}

export const MobileSettingsModal = ({ children }: MobileSettingsModalProps) => {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const isMobile = useIsMobile()

  if (!isMobile) {
    return (
      <Button
        variant="outline"
        onClick={() => setSettingsOpen(true)}
        className="animate-scale-in"
        aria-label="Open dashboard settings"
      >
        <Settings className="h-4 w-4 mr-2" />
        Settings
      </Button>
    )
  }

  return (
    <>
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="mobile-touch-target"
            aria-label="Open menu"
          >
            <Menu className="h-4 w-4" />
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-80">
          <SheetHeader>
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <Button
              variant="ghost"
              className="w-full justify-start mobile-touch-target"
              onClick={() => {
                setSheetOpen(false)
                setSettingsOpen(true)
              }}
            >
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
            {children}
          </div>
        </SheetContent>
      </Sheet>

      <SettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
    </>
  )
}