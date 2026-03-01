import React, { useState, useEffect } from 'react';
import { 
  Bell, 
  AlertTriangle,
  CheckCircle,
  Info,
  Check,
  CheckCheck
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export default function PortalAlerts() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, unread

  const fetchAlerts = async () => {
    try {
      const url = filter === 'unread' 
        ? `${BACKEND_URL}/api/audit/portal/alerts?unread_only=true`
        : `${BACKEND_URL}/api/audit/portal/alerts`;
      const response = await fetch(url);
      if (response.ok) {
        setAlerts(await response.json());
      }
    } catch (error) {
      console.error('Failed to fetch alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, [filter]);

  const markAsRead = async (alertId) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/audit/portal/alerts/${alertId}/read`, {
        method: 'PUT'
      });
      if (response.ok) {
        fetchAlerts();
      }
    } catch (error) {
      toast.error('Failed to mark as read');
    }
  };

  const markAllAsRead = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/audit/portal/alerts/mark-all-read`, {
        method: 'PUT'
      });
      if (response.ok) {
        toast.success('All alerts marked as read');
        fetchAlerts();
      }
    } catch (error) {
      toast.error('Failed to mark all as read');
    }
  };

  const getAlertIcon = (type, severity) => {
    if (severity === 'critical') return AlertTriangle;
    if (type === 'variance_high') return AlertTriangle;
    if (type === 'sync_issue') return Info;
    return Bell;
  };

  const getAlertColor = (severity) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-600 border-red-200';
      case 'warning': return 'bg-amber-100 text-amber-600 border-amber-200';
      default: return 'bg-blue-100 text-blue-600 border-blue-200';
    }
  };

  const formatTime = (isoString) => {
    const date = new Date(isoString);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  const unreadCount = alerts.filter(a => !a.is_read).length;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Alerts</h1>
          <p className="text-gray-500">
            {unreadCount > 0 ? `${unreadCount} unread alerts` : 'All caught up!'}
          </p>
        </div>
        <div className="flex gap-2">
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              className={`px-3 py-1 rounded text-sm ${filter === 'all' ? 'bg-white shadow' : ''}`}
              onClick={() => setFilter('all')}
            >
              All
            </button>
            <button
              className={`px-3 py-1 rounded text-sm ${filter === 'unread' ? 'bg-white shadow' : ''}`}
              onClick={() => setFilter('unread')}
            >
              Unread
            </button>
          </div>
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={markAllAsRead}>
              <CheckCheck className="w-4 h-4 mr-2" />
              Mark all read
            </Button>
          )}
        </div>
      </div>

      {/* Alerts List */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : alerts.length === 0 ? (
        <div className="text-center py-12">
          <CheckCircle className="w-16 h-16 mx-auto mb-4 text-emerald-300" />
          <p className="text-gray-500">No alerts to show</p>
          <p className="text-sm text-gray-400 mt-1">
            Alerts will appear here when variance exceeds threshold or sync issues occur
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => {
            const AlertIcon = getAlertIcon(alert.alert_type, alert.severity);
            return (
              <div
                key={alert.id}
                className={`bg-white rounded-xl border p-4 ${
                  alert.is_read ? 'border-gray-200' : 'border-l-4 border-l-amber-400 border-gray-200'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${getAlertColor(alert.severity)}`}>
                      <AlertIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className={`font-medium ${alert.is_read ? 'text-gray-600' : 'text-gray-900'}`}>
                        {alert.message}
                      </p>
                      <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                        <span>{alert.alert_type.replace('_', ' ')}</span>
                        <span>•</span>
                        <span>{formatTime(alert.created_at)}</span>
                      </div>
                    </div>
                  </div>
                  {!alert.is_read && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => markAsRead(alert.id)}
                      className="text-gray-400 hover:text-emerald-600"
                    >
                      <Check className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
