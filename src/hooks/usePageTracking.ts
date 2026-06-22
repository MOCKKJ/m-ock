/**
 * usePageTracking — automatically fires a page_view event on every route change.
 * Drop this hook inside a component that lives inside <BrowserRouter>.
 */

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Analytics } from '@/lib/analytics';

export function usePageTracking() {
  const location = useLocation();

  useEffect(() => {
    Analytics.pageView(location.pathname);
  }, [location.pathname]);
}
