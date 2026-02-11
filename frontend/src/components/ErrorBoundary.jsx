import React from 'react';

/**
 * Error Boundary Component
 * Catches JavaScript errors in child components and displays a fallback UI
 * Critical for CipherLab RK25, Newland and other scanner devices with older WebView
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null, 
      errorInfo: null 
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log error details for debugging
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
    
    // Try to save error to localStorage for debugging
    try {
      const errorLog = {
        message: error?.message || 'Unknown error',
        stack: error?.stack || '',
        componentStack: errorInfo?.componentStack || '',
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent
      };
      localStorage.setItem('audix_last_error', JSON.stringify(errorLog));
    } catch (e) {
      // Ignore localStorage errors
    }
  }

  handleReload = () => {
    // Clear error state and reload
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  handleClearAndReload = () => {
    // Clear all app data and reload
    try {
      localStorage.removeItem('audix_scanned_items');
      localStorage.removeItem('audix_locations');
      localStorage.removeItem('audix_current_scan_location');
    } catch (e) {
      // Ignore
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // Fallback UI - simple and compatible with older WebView
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          backgroundColor: '#f8fafc',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '24px',
            borderRadius: '12px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
            maxWidth: '90%',
            width: '400px',
            textAlign: 'center'
          }}>
            {/* Error Icon */}
            <div style={{
              width: '64px',
              height: '64px',
              backgroundColor: '#fee2e2',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px'
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>

            <h2 style={{
              margin: '0 0 8px',
              fontSize: '20px',
              fontWeight: '600',
              color: '#1e293b'
            }}>
              Something went wrong
            </h2>

            <p style={{
              margin: '0 0 24px',
              fontSize: '14px',
              color: '#64748b',
              lineHeight: '1.5'
            }}>
              The app encountered an error. Please try reloading.
            </p>

            {/* Action Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                onClick={this.handleReload}
                style={{
                  padding: '14px 24px',
                  backgroundColor: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  WebkitTapHighlightColor: 'transparent'
                }}
              >
                Reload App
              </button>
              
              <button
                onClick={this.handleClearAndReload}
                style={{
                  padding: '12px 24px',
                  backgroundColor: 'transparent',
                  color: '#64748b',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  WebkitTapHighlightColor: 'transparent'
                }}
              >
                Clear Data & Reload
              </button>
            </div>

            {/* Error Details (collapsed) */}
            {this.state.error && (
              <details style={{
                marginTop: '16px',
                textAlign: 'left',
                fontSize: '12px',
                color: '#94a3b8'
              }}>
                <summary style={{ cursor: 'pointer', marginBottom: '8px' }}>
                  Show error details
                </summary>
                <pre style={{
                  backgroundColor: '#f1f5f9',
                  padding: '8px',
                  borderRadius: '4px',
                  overflow: 'auto',
                  maxHeight: '150px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word'
                }}>
                  {this.state.error.toString()}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
