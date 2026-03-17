import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Lock, CheckCircle2, PlayCircle, Clock, GraduationCap, BookOpen, ArrowRight, ChevronRight } from "lucide-react";
import { getModules, TrainingPath } from "@/lib/training-modules";
import { useTrainingProgress } from "@/hooks/useTrainingProgress";
import InternalNav from "@/components/InternalNav";

const TrainingCenter = () => {
  const navigate = useNavigate();
  const [activePath, setActivePath] = useState<TrainingPath>("lead");
  const [isInternal, setIsInternal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isDirector, setIsDirector] = useState(false);

  const { progress, loading: progressLoading, overallProgress } = useTrainingProgress(activePath);
  const modules = getModules(activePath);

  useEffect(() => {
    async function checkAccess() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/internal-login"); return; }

      const { data } = await supabase
        .from("internal_users")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!data) { navigate("/"); return; }
      setIsInternal(true);
      setIsSuperAdmin(data.role === "super_admin");
      setIsDirector(data.role === "director");
      setLoading(false);
    }
    checkAccess();
  }, [navigate]);

  if (loading || progressLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#FAFAFA" }}>
        <div className="animate-pulse" style={{ color: "#999", fontFamily: "'Inter', sans-serif", fontSize: "14px", letterSpacing: "0.02em" }}>
          Loading...
        </div>
      </div>
    );
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed": return <CheckCircle2 className="h-4 w-4" style={{ color: "#2ECC71" }} />;
      case "in_progress": return <PlayCircle className="h-4 w-4" style={{ color: "#111" }} />;
      case "available": return <BookOpen className="h-4 w-4" style={{ color: "#111" }} />;
      default: return <Lock className="h-4 w-4" style={{ color: "#CCC" }} />;
    }
  };

  const completedCount = modules.filter((m) => progress[m.id]?.status === "completed").length;

  return (
    <div className="min-h-screen" style={{ background: "#FAFAFA", fontFamily: "'Inter', sans-serif" }}>
      {/* Minimal top bar */}
      <header className="sticky top-0 z-20" style={{ background: "#FFF", borderBottom: "1px solid #E8E8E8" }}>
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/internal-portal")}
              className="text-xs uppercase tracking-[0.15em] hover:opacity-60 transition-opacity"
              style={{ color: "#999", fontWeight: 500 }}
            >
              ← Portal
            </button>
            <div style={{ width: "1px", height: "16px", background: "#E0E0E0" }} />
            <h1 className="text-sm font-semibold tracking-tight" style={{ color: "#111" }}>
              Training Center
            </h1>
          </div>
          <InternalNav isSuperAdmin={isSuperAdmin} isDirector={isDirector} currentPage="training" />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-16">
        {/* Hero */}
        <div className="mb-16">
          <p className="text-xs uppercase tracking-[0.2em] mb-4" style={{ color: "#999", fontWeight: 600 }}>
            Finance & Accounting
          </p>
          <h2 className="text-4xl font-bold tracking-tight mb-3" style={{ color: "#111", fontFamily: "'Playfair Display', serif", lineHeight: 1.15 }}>
            Your Learning Journey
          </h2>
          <p className="text-base" style={{ color: "#666", maxWidth: "560px", lineHeight: 1.7 }}>
            Master the systems, controls, and accounting principles that power Warwickshire's financial operations.
          </p>
        </div>

        {/* Progress strip */}
        <div className="mb-12 p-6 rounded-2xl" style={{ background: "#111", color: "#FFF" }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs uppercase tracking-[0.15em]" style={{ color: "rgba(255,255,255,0.5)" }}>
                Overall Progress
              </p>
              <p className="text-2xl font-bold mt-1" style={{ fontFamily: "'Playfair Display', serif" }}>
                {completedCount} of {modules.length} <span className="text-sm font-normal" style={{ color: "rgba(255,255,255,0.6)" }}>modules completed</span>
              </p>
            </div>
            <div className="text-right">
              <span className="text-4xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>
                {overallProgress}%
              </span>
            </div>
          </div>
          <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.15)" }}>
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{ width: `${overallProgress}%`, background: "#FFF" }}
            />
          </div>
        </div>

        {/* Path Selection */}
        <Tabs value={activePath} onValueChange={(v) => setActivePath(v as TrainingPath)} className="mb-10">
          <div className="flex gap-1 mb-10 p-1 rounded-xl" style={{ background: "#F0F0F0", display: "inline-flex" }}>
            <button
              onClick={() => setActivePath("lead")}
              className="px-5 py-2.5 rounded-lg text-sm font-medium transition-all"
              style={{
                background: activePath === "lead" ? "#111" : "transparent",
                color: activePath === "lead" ? "#FFF" : "#666",
              }}
            >
              Accounting Lead
            </button>
            <button
              onClick={() => setActivePath("admin")}
              className="px-5 py-2.5 rounded-lg text-sm font-medium transition-all"
              style={{
                background: activePath === "admin" ? "#111" : "transparent",
                color: activePath === "admin" ? "#FFF" : "#666",
              }}
            >
              Accounting Admin
            </button>
          </div>

          <TabsContent value={activePath} className="mt-0">
            <div className="space-y-0">
              {modules.map((mod, idx) => {
                const modProgress = progress[mod.id];
                const status = modProgress?.status || "locked";
                const isClickable = status !== "locked";
                const isCompleted = status === "completed";
                const isActive = status === "in_progress";

                return (
                  <div key={mod.id}>
                    <div
                      className={`group flex items-center gap-5 py-5 px-4 -mx-4 rounded-xl transition-all ${
                        isClickable ? "cursor-pointer hover:bg-white" : "opacity-40"
                      }`}
                      style={{
                        ...(isActive ? { background: "#FFF", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" } : {}),
                      }}
                      onClick={() => isClickable && navigate(`/training/${activePath}/${mod.id}`)}
                    >
                      {/* Module number */}
                      <div
                        className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold"
                        style={{
                          background: isCompleted ? "#111" : isActive ? "#111" : "#F0F0F0",
                          color: isCompleted || isActive ? "#FFF" : "#999",
                        }}
                      >
                        {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : String(mod.number).padStart(2, "0")}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <h3 className="font-semibold text-sm" style={{ color: isClickable ? "#111" : "#999" }}>
                            {mod.title}
                          </h3>
                          {isActive && (
                            <span className="text-[10px] uppercase tracking-[0.15em] px-2 py-0.5 rounded-full font-semibold"
                              style={{ background: "#E8F5E9", color: "#2E7D32" }}>
                              In Progress
                            </span>
                          )}
                        </div>
                        <p className="text-xs" style={{ color: "#999" }}>
                          {mod.sections.length} sections · {mod.estimatedMinutes} min
                          {modProgress?.quiz_score !== null && modProgress?.quiz_score !== undefined && (
                            <span className="ml-2" style={{ color: modProgress.quiz_passed ? "#2ECC71" : "#E74C3C" }}>
                              · Score: {modProgress.quiz_score}%
                            </span>
                          )}
                        </p>
                      </div>

                      {/* Arrow */}
                      {isClickable && (
                        <ChevronRight className="h-4 w-4 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "#999" }} />
                      )}
                    </div>

                    {/* Divider */}
                    {idx < modules.length - 1 && (
                      <div className="mx-4" style={{ borderBottom: "1px solid #F0F0F0" }} />
                    )}
                  </div>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="py-8 text-center">
        <p className="text-xs" style={{ color: "#CCC", letterSpacing: "0.1em" }}>
          WARWICKSHIRE PVT LTD · INTERNAL TRAINING
        </p>
      </footer>
    </div>
  );
};

export default TrainingCenter;
