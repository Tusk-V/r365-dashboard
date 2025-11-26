// hooks/useAccessCheck.js

import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

const ADMIN_EMAIL = 'dalton@rancherscustard.com';

export function useAccessCheck() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);
  const [dashboardAccess, setDashboardAccess] = useState(null);

  const isAdmin = session?.user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  // Check if user has any access
  const hasAccess = () => {
    if (isAdmin) return true;
    if (!dashboardAccess) return false;
    return dashboardAccess.type === 'all' || dashboardAccess.type === 'specific';
  };

  // Check if user has access to a specific location
  const hasLocationAccess = (locationName) => {
    if (isAdmin) return true;
    if (!dashboardAccess) return false;
    if (dashboardAccess.type === 'all') return true;
    if (dashboardAccess.type === 'specific') {
      return dashboardAccess.locations?.includes(locationName);
    }
    return false;
  };

  // Load access permissions
  useEffect(() => {
    const loadAccess = async () => {
      if (status !== "authenticated") return;
      
      try {
        const res = await fetch('/api/check-access');
        const data = await res.json();
        
        if (res.ok) {
          setDashboardAccess(data.dashboardAccess || { type: 'none', locations: [] });
        } else {
          setDashboardAccess({ type: 'none', locations: [] });
        }
      } catch (err) {
        console.error('Error loading dashboard access:', err);
        setDashboardAccess({ type: 'none', locations: [] });
      } finally {
        setIsChecking(false);
      }
    };

    loadAccess();
  }, [status]);

  // Redirect logic
  useEffect(() => {
    if (status === "loading" || isChecking) return;

    if (status === "unauthenticated") {
      router.push("/auth/signin");
      return;
    }

    if (session?.user && !isAdmin && dashboardAccess?.type === 'none') {
      router.push("/auth/access-pending");
      return;
    }
  }, [session, status, isChecking, isAdmin, dashboardAccess, router]);

  return {
    session,
    status,
    isLoading: status === "loading" || isChecking,
    isAdmin,
    hasAccess: hasAccess(),
    hasLocationAccess,
    dashboardAccess
  };
}
