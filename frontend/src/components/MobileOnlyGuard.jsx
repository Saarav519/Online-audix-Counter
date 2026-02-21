import React from 'react';
import { Smartphone } from 'lucide-react';

const MobileOnlyGuard = ({ children }) => {
  const [isMobile, setIsMobile] = React.useState(true);

  React.useEffect(() => {
    const checkMobile = () => {
      // Check if device is mobile (width <= 768px or touch device)
      const isMobileDevice = window.innerWidth <= 768 || 
        ('ontouchstart' in window) || 
        (navigator.maxTouchPoints > 0);
      setIsMobile(isMobileDevice);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  if (!isMobile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center p-8">
        <div className="max-w-md text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-emerald-100 rounded-full mb-6">
            <Smartphone className="w-10 h-10 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">Mobile App Only</h1>
          <p className="text-gray-600 mb-6">
            This scanner app is designed for mobile devices and handheld scanners only. 
            Please access it from your mobile device or scanner.
          </p>
          <div className="p-4 bg-white rounded-xl shadow-sm border border-gray-200">
            <p className="text-sm text-gray-500 mb-2">Looking for the Admin Portal?</p>
            <a 
              href="/portal" 
              className="inline-flex items-center justify-center px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors"
            >
              Go to Admin Portal
            </a>
          </div>
        </div>
      </div>
    );
  }

  return children;
};

export default MobileOnlyGuard;
