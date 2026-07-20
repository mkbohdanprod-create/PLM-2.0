import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';

interface PopoutWindowProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function PopoutWindow({ title, onClose, children }: PopoutWindowProps) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const newWindow = useRef<Window | null>(null);

  useEffect(() => {
    // Open a new browser window
    newWindow.current = window.open('', '', 'width=1000,height=800,left=200,top=200');
    if (!newWindow.current) {
      alert("Увімкніть спливаючі вікна (pop-ups) у браузері для цієї функції.");
      onClose();
      return;
    }

    // Set title
    newWindow.current.document.title = title;

    // Create a container div
    const div = document.createElement('div');
    div.style.width = '100vw';
    div.style.height = '100vh';
    div.style.display = 'flex';
    div.style.flexDirection = 'column';
    div.style.backgroundColor = 'var(--bg-app)'; 
    div.style.overflow = 'auto';
    div.classList.add('theme-transition');
    
    // Copy HTML class for theme
    newWindow.current.document.documentElement.className = document.documentElement.className;

    // Reset body margin
    newWindow.current.document.body.style.margin = '0';
    newWindow.current.document.body.style.padding = '0';
    newWindow.current.document.body.style.overflow = 'hidden';
    newWindow.current.document.body.appendChild(div);
    setContainer(div);

    // Copy styles
    Array.from(document.styleSheets).forEach((styleSheet) => {
      try {
        if (styleSheet.cssRules) {
          const newStyleEl = document.createElement('style');
          Array.from(styleSheet.cssRules).forEach((cssRule) => {
            newStyleEl.appendChild(document.createTextNode(cssRule.cssText));
          });
          newWindow.current!.document.head.appendChild(newStyleEl);
        } else if (styleSheet.href) {
          const newLinkEl = document.createElement('link');
          newLinkEl.rel = 'stylesheet';
          newLinkEl.href = styleSheet.href;
          newWindow.current!.document.head.appendChild(newLinkEl);
        }
      } catch (e) {
        // cross-origin stylesheets throw SecurityError on cssRules access. Link them directly!
        if (styleSheet.href) {
          const newLinkEl = document.createElement('link');
          newLinkEl.rel = 'stylesheet';
          newLinkEl.href = styleSheet.href;
          newWindow.current!.document.head.appendChild(newLinkEl);
        }
      }
    });

    // Also copy all style tags that might have been injected by Vite
    document.querySelectorAll('style').forEach(styleTag => {
      const clonedStyle = styleTag.cloneNode(true);
      newWindow.current!.document.head.appendChild(clonedStyle);
    });

    const handleBeforeUnload = () => {
      onClose();
    };
    newWindow.current.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      if (newWindow.current) {
        newWindow.current.removeEventListener('beforeunload', handleBeforeUnload);
        newWindow.current.close();
      }
    };
  }, []);

  if (!container) return null;

  return createPortal(children, container);
}
