import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Lock, CheckCircle2, PlayCircle, Clock, GraduationCap, BookOpen, ArrowRight } from "lucide-react";
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
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading Training Center...</div>
      </div>
    );
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed": return <CheckCircle2 className="h-5 w-5 text-green-600" />;
      case "in_progress": return <PlayCircle className="h-5 w-5 text-blue-600" />;
      case "available": return <BookOpen className="h-5 w-5 text-primary" />;
      default: return <Lock className="h-5 w-5 text-muted-foreground/50" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed": return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Completed</Badge>;
      case "in_progress": return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">In Progress</Badge>;
      case "available": return <Badge className="bg-primary/10 text-primary hover:bg-primary/10">Available</Badge>;
      default: return <Badge variant="outline" className="text-muted-foreground">Locked</Badge>;
    }
  };

  const completedCount = modules.filter((m) => progress[m.id]?.status === "completed").length;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-primary text-primary-foreground shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <GraduationCap className="h-7 w-7" />
            <div>
              <h1 className="text-xl font-bold">Training Center</h1>
              <p className="text-sm text-primary-foreground/70">Finance & Accounting LMS</p>
            </div>
          </div>
          <InternalNav isSuperAdmin={isSuperAdmin} isDirector={isDirector} currentPage="training" />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Overall Progress */}
        <Card className="mb-8 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Your Progress</h2>
                <p className="text-sm text-muted-foreground">
                  {completedCount} of {modules.length} modules completed
                </p>
              </div>
              <span className="text-2xl font-bold text-primary">{overallProgress}%</span>
            </div>
            <Progress value={overallProgress} className="h-3" />
          </CardContent>
        </Card>

        {/* Path Selection */}
        <Tabs value={activePath} onValueChange={(v) => setActivePath(v as TrainingPath)} className="mb-8">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="lead" className="flex items-center gap-2">
              <GraduationCap className="h-4 w-4" />
              Accounting Lead
            </TabsTrigger>
            <TabsTrigger value="admin" className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              Accounting Admin
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activePath} className="mt-6">
            <div className="grid gap-4">
              {modules.map((mod, idx) => {
                const modProgress = progress[mod.id];
                const status = modProgress?.status || "locked";
                const isClickable = status !== "locked";

                return (
                  <Card
                    key={mod.id}
                    className={`transition-all ${
                      isClickable
                        ? "cursor-pointer hover:shadow-md hover:border-primary/30"
                        : "opacity-60"
                    } ${status === "in_progress" ? "border-blue-300 bg-blue-50/30" : ""} ${
                      status === "completed" ? "border-green-300 bg-green-50/30" : ""
                    }`}
                    onClick={() => isClickable && navigate(`/training/${activePath}/${mod.id}`)}
                  >
                    <CardContent className="py-5 px-6">
                      <div className="flex items-center gap-4">
                        <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-primary/5 flex items-center justify-center text-2xl">
                          {mod.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              Module {mod.number}
                            </span>
                            {getStatusBadge(status)}
                          </div>
                          <h3 className="font-semibold text-foreground">{mod.title}</h3>
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{mod.objective}</p>
                          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {mod.estimatedMinutes} min
                            </span>
                            <span>{mod.sections.length} sections</span>
                            <span>{mod.quiz.length} quiz questions</span>
                            {modProgress?.quiz_score !== null && modProgress?.quiz_score !== undefined && (
                              <span className={`font-medium ${modProgress.quiz_passed ? "text-green-600" : "text-destructive"}`}>
                                Score: {modProgress.quiz_score}%
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex-shrink-0">
                          {getStatusIcon(status)}
                        </div>
                        {isClickable && (
                          <ArrowRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default TrainingCenter;
