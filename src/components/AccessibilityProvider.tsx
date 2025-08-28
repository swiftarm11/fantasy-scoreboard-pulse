import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback, useMemo } from 'react';

interface AccessibilityContextType {
  highContrast: boolean;
  reducedMotion: boolean;
  fontSize: 'normal' | 'large' | 'xl';
  announceMessage: (message: string) => void;
  focusElement: (elementId: string) => void;
}

const AccessibilityContext = createContext<AccessibilityContextType | undefined>(undefined);

interface AccessibilityProviderProps {
  children: ReactNode;
}

export const AccessibilityProvider = ({ children }: AccessibilityProviderProps) => {
  const [highContrast, setHighContrast] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [fontSize, setFontSize] = useState<'normal' | 'large' | 'xl'>('normal');

  useEffect(() => {
    // Check for system preferences
    const mediaQueryContrast = window.matchMedia('(prefers-contrast: high)');
    const mediaQueryMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    setHighContrast(mediaQueryContrast.matches);
    setReducedMotion(mediaQueryMotion.matches);

    // Listen for changes
    const handleContrastChange = (e: MediaQueryListEvent) => setHighContrast(e.matches);
    const handleMotionChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);

    mediaQueryContrast.addEventListener('change', handleContrastChange);
    mediaQueryMotion.addEventListener('change', handleMotionChange);

    // Load saved preferences
    const savedFontSize = localStorage.getItem('accessibility-font-size') as 'normal' | 'large' | 'xl';
    if (savedFontSize) setFontSize(savedFontSize);

    const savedHighContrast = localStorage.getItem('accessibility-high-contrast') === 'true';
    if (savedHighContrast !== null) setHighContrast(savedHighContrast);

    return () => {
      mediaQueryContrast.removeEventListener('change', handleContrastChange);
      mediaQueryMotion.removeEventListener('change', handleMotionChange);
    };
  }, []);

  useEffect(() => {
    // Apply accessibility classes to document
    const root = document.documentElement;
    
    root.classList.toggle('high-contrast', highContrast);
    root.classList.toggle('reduced-motion', reducedMotion);
    root.classList.toggle('large-font', fontSize === 'large');
    root.classList.toggle('xl-font', fontSize === 'xl');

    // Save preferences
    localStorage.setItem('accessibility-font-size', fontSize);
    localStorage.setItem('accessibility-high-contrast', String(highContrast));
  }, [highContrast, reducedMotion, fontSize]);

  const announceMessage = useCallback((message: string) => {
    // Create or update aria-live region
    let announcer = document.getElementById('accessibility-announcer');
    if (!announcer) {
      announcer = document.createElement('div');
      announcer.id = 'accessibility-announcer';
      announcer.setAttribute('aria-live', 'polite');
      announcer.setAttribute('aria-atomic', 'true');
      announcer.style.position = 'absolute';
      announcer.style.left = '-10000px';
      announcer.style.width = '1px';
      announcer.style.height = '1px';
      announcer.style.overflow = 'hidden';
      document.body.appendChild(announcer);
    }

    // Clear and set new message
    announcer.textContent = '';
    setTimeout(() => {
      announcer!.textContent = message;
    }, 100);
  }, []);

  const focusElement = useCallback((elementId: string) => {
    const element = document.getElementById(elementId);
    if (element) {
      element.focus();
      element.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
    }
  }, [reducedMotion]);

  const value: AccessibilityContextType = useMemo(() => ({
    highContrast,
    reducedMotion,
    fontSize,
    announceMessage,
    focusElement,
  }), [highContrast, reducedMotion, fontSize, announceMessage, focusElement]);

  const classNames = useMemo(() => 
    `${highContrast ? 'accessibility-high-contrast' : ''} ${reducedMotion ? 'accessibility-reduced-motion' : ''} ${fontSize === 'large' ? 'accessibility-large-font' : ''} ${fontSize === 'xl' ? 'accessibility-xl-font' : ''}`.trim(),
    [highContrast, reducedMotion, fontSize]
  );

  return (
    <AccessibilityContext.Provider value={value}>
      <div className={classNames}>
        {children}
      </div>
    </AccessibilityContext.Provider>
  );
};

export const useAccessibility = () => {
  const context = useContext(AccessibilityContext);
  if (context === undefined) {
    throw new Error('useAccessibility must be used within an AccessibilityProvider');
  }
  return context;
};

// Keyboard navigation hook
export const useKeyboardNavigation = () => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Skip navigation for form elements
      if (event.target instanceof HTMLInputElement || 
          event.target instanceof HTMLTextAreaElement ||
          event.target instanceof HTMLSelectElement) {
        return;
      }

      switch (event.key) {
        case 'Tab':
          // Let default tab behavior work
          break;
        case 'Escape':
          // Close modals or focused elements
          const activeElement = document.activeElement as HTMLElement;
          if (activeElement && activeElement.blur) {
            activeElement.blur();
          }
          break;
        case 'Enter':
        case ' ':
          // Activate buttons and links
          if (event.target instanceof HTMLElement) {
            if (event.target.role === 'button' || event.target.tagName === 'BUTTON') {
              event.preventDefault();
              event.target.click();
            }
          }
          break;
        case 'ArrowUp':
        case 'ArrowDown':
          // Navigate lists and grids
          event.preventDefault();
          navigateVertically(event.key === 'ArrowUp' ? -1 : 1);
          break;
        case 'ArrowLeft':
        case 'ArrowRight':
          // Navigate horizontally
          event.preventDefault();
          navigateHorizontally(event.key === 'ArrowLeft' ? -1 : 1);
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);
};

const navigateVertically = (direction: number) => {
  const focusableElements = getFocusableElements();
  const currentIndex = focusableElements.indexOf(document.activeElement as HTMLElement);
  
  if (currentIndex !== -1) {
    const nextIndex = Math.max(0, Math.min(focusableElements.length - 1, currentIndex + direction));
    focusableElements[nextIndex]?.focus();
  }
};

const navigateHorizontally = (direction: number) => {
  // Similar to vertical but for horizontal navigation
  navigateVertically(direction);
};

const getFocusableElements = (): HTMLElement[] => {
  const selector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  return Array.from(document.querySelectorAll(selector)).filter(
    el => !el.hasAttribute('disabled') && el.getAttribute('tabindex') !== '-1'
  ) as HTMLElement[];
};