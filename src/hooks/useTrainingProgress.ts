import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getModules, TrainingPath } from "@/lib/training-modules";

export interface ModuleProgress {
  module_id: string;
  status: "locked" | "available" | "in_progress" | "completed";
  quiz_score: number | null;
  quiz_passed: boolean;
  started_at: string | null;
  completed_at: string | null;
}

export function useTrainingProgress(path: TrainingPath) {
  const [progress, setProgress] = useState<Record<string, ModuleProgress>>({});
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const modules = getModules(path);

  // Compute default progress (module 1 available, rest locked)
  const computeDefaults = useCallback(
    (saved: Record<string, ModuleProgress>) => {
      const result: Record<string, ModuleProgress> = {};
      modules.forEach((mod, idx) => {
        if (saved[mod.id]) {
          result[mod.id] = saved[mod.id];
        } else {
          const prevMod = idx > 0 ? modules[idx - 1] : null;
          const prevCompleted = prevMod ? saved[prevMod.id]?.status === "completed" : true;
          result[mod.id] = {
            module_id: mod.id,
            status: idx === 0 ? "available" : prevCompleted ? "available" : "locked",
            quiz_score: null,
            quiz_passed: false,
            started_at: null,
            completed_at: null,
          };
        }
      });
      return result;
    },
    [modules]
  );

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setUserId(user.id);

      const { data } = await supabase
        .from("training_progress")
        .select("*")
        .eq("user_id", user.id)
        .eq("training_path", path);

      const saved: Record<string, ModuleProgress> = {};
      (data || []).forEach((row: any) => {
        saved[row.module_id] = {
          module_id: row.module_id,
          status: row.status,
          quiz_score: row.quiz_score,
          quiz_passed: row.quiz_passed,
          started_at: row.started_at,
          completed_at: row.completed_at,
        };
      });

      setProgress(computeDefaults(saved));
      setLoading(false);
    }
    load();
  }, [path, computeDefaults]);

  const startModule = useCallback(
    async (moduleId: string) => {
      if (!userId) return;
      const now = new Date().toISOString();
      await supabase.from("training_progress").upsert(
        { user_id: userId, training_path: path, module_id: moduleId, status: "in_progress", started_at: now },
        { onConflict: "user_id,training_path,module_id" }
      );
      setProgress((prev) => ({
        ...prev,
        [moduleId]: { ...prev[moduleId], status: "in_progress", started_at: now },
      }));
    },
    [userId, path]
  );

  const completeModule = useCallback(
    async (moduleId: string, score: number, passed: boolean) => {
      if (!userId) return;
      const now = new Date().toISOString();
      const status = passed ? "completed" : "in_progress";
      await supabase.from("training_progress").upsert(
        {
          user_id: userId, training_path: path, module_id: moduleId,
          status, quiz_score: score, quiz_passed: passed,
          completed_at: passed ? now : null,
        },
        { onConflict: "user_id,training_path,module_id" }
      );
      setProgress((prev) => {
        const updated = {
          ...prev,
          [moduleId]: { ...prev[moduleId], status: status as any, quiz_score: score, quiz_passed: passed, completed_at: passed ? now : null },
        };
        // Unlock next module
        if (passed) {
          const idx = modules.findIndex((m) => m.id === moduleId);
          if (idx >= 0 && idx < modules.length - 1) {
            const nextId = modules[idx + 1].id;
            if (updated[nextId]?.status === "locked") {
              updated[nextId] = { ...updated[nextId], status: "available" };
            }
          }
        }
        return updated;
      });
    },
    [userId, path, modules]
  );

  const overallProgress = modules.length
    ? Math.round((modules.filter((m) => progress[m.id]?.status === "completed").length / modules.length) * 100)
    : 0;

  return { progress, loading, startModule, completeModule, overallProgress, userId };
}
