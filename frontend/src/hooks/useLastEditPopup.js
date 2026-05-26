import { useCallback, useState, useRef } from 'react';

/**
 * useLastEditPopup — shared hook that wraps the open/close state of the
 * <LastEditedPopup /> modal AND remembers the "proceed" callback supplied
 * by the caller at open-time.
 *
 * Usage:
 *
 *   const { isOpen, openPopup, closePopup, popupProps } = useLastEditPopup();
 *
 *   <LastEditedPopup {...popupProps} />
 *
 *   // before any edit-mode entry:
 *   openPopup(barcode, clientId, () => {
 *     setEditingTrue();
 *   });
 *
 * Behaviour:
 *   • If the barcode has NO history → <LastEditedPopup /> silently runs
 *     the onProceed callback and never renders. Nothing to do in the
 *     caller — the edit just opens.
 *   • If the barcode has history → the popup renders with Proceed /
 *     Cancel. Proceed → onProceed callback. Cancel → noop.
 *   • API failure → popup falls back to onProceed (graceful, no toast).
 *
 * The hook is intentionally self-contained: state owned here, callback
 * stored in a ref so re-renders of the caller don't re-trigger.
 */
export default function useLastEditPopup() {
  const [isOpen, setIsOpen] = useState(false);
  const [barcode, setBarcode] = useState('');
  const [clientId, setClientId] = useState('');
  const onProceedRef = useRef(null);

  const openPopup = useCallback((bc, cid, onProceedCb) => {
    setBarcode(String(bc || ''));
    setClientId(String(cid || ''));
    onProceedRef.current = typeof onProceedCb === 'function' ? onProceedCb : null;
    setIsOpen(true);
  }, []);

  const closePopup = useCallback(() => {
    setIsOpen(false);
    onProceedRef.current = null;
  }, []);

  const handleProceed = useCallback(() => {
    const cb = onProceedRef.current;
    // Clear FIRST so any re-entry doesn't double-fire.
    onProceedRef.current = null;
    setIsOpen(false);
    if (cb) {
      try { cb(); } catch { /* swallow — caller's edit handler is responsible */ }
    }
  }, []);

  const handleCancel = useCallback(() => {
    onProceedRef.current = null;
    setIsOpen(false);
  }, []);

  const popupProps = {
    barcode,
    clientId,
    isOpen,
    onProceed: handleProceed,
    onCancel: handleCancel,
    onClose: closePopup,
  };

  return { isOpen, openPopup, closePopup, popupProps };
}
