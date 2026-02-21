import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useArticleAdmin, ArticleFeedback, Article } from "@/hooks/useArticles";
import InternalNav from "@/components/InternalNav";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { ArrowLeft, MessageSquare, Filter } from "lucide-react";

const ArticleFeedbackDashboard = () => {
  const navigate = useNavigate();
  const { articles, feedback, loading, fetchFeedback } = useArticleAdmin();
  const [filterArticleId, setFilterArticleId] = useState<string>("all");
  const [isInternal, setIsInternal] = useState(false);

  useEffect(() => {
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/internal-login"); return; }
      const { data } = await supabase.from("internal_users").select("id").eq("user_id", session.user.id).single();
      if (!data) { navigate("/"); return; }
      setIsInternal(true);
    };
    check();
  }, [navigate]);

  useEffect(() => {
    if (filterArticleId === "all") {
      fetchFeedback();
    } else {
      fetchFeedback(filterArticleId);
    }
  }, [filterArticleId, fetchFeedback]);

  if (!isInternal || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  const getArticleTitle = (articleId: string) => {
    return articles.find((a) => a.id === articleId)?.title || "Unknown Article";
  };

  return (
    <div className="min-h-screen bg-background">
      <InternalNav />
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate("/internal-portal")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
              <MessageSquare className="h-5 w-5" /> Customer Feedback
            </h1>
            <p className="text-xs text-muted-foreground">Comments and suggestions from customers on published articles</p>
          </div>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2 mb-4">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={filterArticleId} onValueChange={setFilterArticleId}>
            <SelectTrigger className="w-[260px]"><SelectValue placeholder="Filter by article" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Articles</SelectItem>
              {articles.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Feedback list */}
        <div className="space-y-3">
          {feedback.length === 0 ? (
            <div className="text-center py-16">
              <MessageSquare className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No feedback yet</p>
            </div>
          ) : (
            feedback.map((fb) => (
              <div key={fb.id} className="bg-card rounded-lg border border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                      <span className="font-medium text-foreground">{fb.customer_name || "Anonymous"}</span>
                      {fb.stand_number && <span>· Stand {fb.stand_number}</span>}
                      <span>· {format(new Date(fb.created_at), "d MMM yyyy, HH:mm")}</span>
                    </div>
                    <p className="text-sm text-foreground">{fb.comment}</p>
                    <p className="text-[10px] text-muted-foreground mt-2">
                      Re: {getArticleTitle(fb.article_id)}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default ArticleFeedbackDashboard;
