import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface OnboardingState {
  needsOnboarding: boolean;
  loading: boolean;
  markComplete: () => Promise<void>;
}

export const useOnboarding = (): OnboardingState => {
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkOnboardingStatus();
  }, []);

  const checkOnboardingStatus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setNeedsOnboarding(false);
        setLoading(false);
        return;
      }

      // Check if user has completed onboarding
      const { data: onboarding, error } = await supabase
        .from('customer_onboarding')
        .select('completed')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Error checking onboarding status:', error);
        // If there's an error, don't show onboarding
        setNeedsOnboarding(false);
      } else if (!onboarding) {
        // No onboarding record means new user - show onboarding
        setNeedsOnboarding(true);
      } else {
        // Record exists - check if completed
        setNeedsOnboarding(!onboarding.completed);
      }
    } catch (error) {
      console.error('Error checking onboarding:', error);
      setNeedsOnboarding(false);
    } finally {
      setLoading(false);
    }
  };

  const markComplete = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase.from('customer_onboarding').upsert({
        user_id: user.id,
        completed: true,
        completed_at: new Date().toISOString(),
        current_step: 6
      }, { onConflict: 'user_id' });

      setNeedsOnboarding(false);
    } catch (error) {
      console.error('Error marking onboarding complete:', error);
    }
  };

  return { needsOnboarding, loading, markComplete };
};
