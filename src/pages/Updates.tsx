import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useArticles, useArticleAdmin } from "@/hooks/useArticles";
import CustomerHeader from "@/components/CustomerHeader";
import BottomNav from "@/components/BottomNav";
import InternalNav from "@/components/InternalNav";
import ArticleCard from "@/components/articles/ArticleCard";
import ArticleDetail from "@/components/articles/ArticleDetail";
import ArticleEditor from "@/components/articles/ArticleEditor";
import ArticleEmailComposer from "@/components/articles/ArticleEmailComposer";
import { useSessionTimeout } from "@/hooks/useSessionTimeout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Newspaper, Plus, Mail, Edit, Trash2, Eye, EyeOff } from "lucide-react";
import { format } from "date-fns";

const Updates = () => {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isInternalUser, setIsInternalUser] = useState(false);
  const [internalRole, setInternalRole] = useState<string | null>(null);
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editingArticleId, setEditingArticleId] = useState<string | null>(null);
  const [emailArticleId, setEmailArticleId] = useState<string | null>(null);

  const customerHook = useArticles();
  const adminHook = useArticleAdmin();

  useSessionTimeout();

  useEffect(() => {
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/login"); return; }
      
      const { data: internalUser } = await supabase
        .from("internal_users")
        .select("id, role")
        .eq("user_id", session.user.id)
        .single();

      if (internalUser) {
        setIsInternalUser(true);
        setInternalRole(internalUser.role);
      }
      setIsAuthenticated(true);
    };
    check();
  }, [navigate]);

  if (!isAuthenticated || (isInternalUser ? adminHook.loading : customerHook.loading)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  // ─── Article Detail View (both internal & customer) ───
  if (selectedArticleId) {
    const articles = isInternalUser ? adminHook.articles : customerHook.articles;
    const article = articles.find(a => a.id === selectedArticleId);
    if (article) {
      return (
        <ArticleDetail
          article={article}
          readStatus={customerHook.readStatuses[article.id]}
          onBack={() => setSelectedArticleId(null)}
          onToggleRead={customerHook.toggleReadStatus}
          onSubmitFeedback={customerHook.submitFeedback}
        />
      );
    }
  }

  const editingArticle = editingArticleId ? adminHook.articles.find(a => a.id === editingArticleId) : undefined;
  const emailArticle = emailArticleId ? adminHook.articles.find(a => a.id === emailArticleId) : undefined;

  // ─── Internal User: Management View ───
  if (isInternalUser) {
    return (
      <div className="min-h-screen bg-background">
        <header className="bg-primary text-primary-foreground sticky top-0 z-50 shadow-lg">
          <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <Newspaper className="h-5 w-5" />
              <div>
                <h1 className="text-lg font-bold">Articles & Updates</h1>
                <p className="text-xs text-primary-foreground/70">Create, edit, and broadcast</p>
              </div>
            </div>
            <InternalNav
              isSuperAdmin={internalRole === "super_admin"}
              isDirector={internalRole === "director"}
              currentPage="articles"
            />
          </div>
        </header>

        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-base font-semibold text-foreground">All Articles</h2>
            <Button size="sm" onClick={() => { setEditingArticleId(null); setShowEditor(true); }} className="gap-1.5">
              <Plus className="h-4 w-4" /> New Article
            </Button>
          </div>

          <Dialog open={showEditor} onOpenChange={setShowEditor}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingArticle ? "Edit Article" : "Create New Article"}</DialogTitle>
              </DialogHeader>
              <ArticleEditor
                article={editingArticle}
                onSave={editingArticle
                  ? (data) => adminHook.updateArticle(editingArticle.id, data)
                  : adminHook.createArticle
                }
                onCancel={() => { setShowEditor(false); setEditingArticleId(null); }}
              />
            </DialogContent>
          </Dialog>

          <Dialog open={!!emailArticleId} onOpenChange={() => setEmailArticleId(null)}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Send Article via Email</DialogTitle>
              </DialogHeader>
              {emailArticle && <ArticleEmailComposer article={emailArticle} onClose={() => setEmailArticleId(null)} />}
            </DialogContent>
          </Dialog>

          <div className="space-y-3">
            {adminHook.articles.length === 0 ? (
              <div className="text-center py-16">
                <Newspaper className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No articles yet. Create your first one!</p>
              </div>
            ) : (
              adminHook.articles.map((article) => (
                <div key={article.id} className="bg-card rounded-lg border border-border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <button className="flex-1 text-left" onClick={() => setSelectedArticleId(article.id)}>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={article.is_published ? "default" : "secondary"} className="text-[10px]">
                          {article.is_published ? "Published" : "Draft"}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">{article.category}</Badge>
                      </div>
                      <h3 className="font-semibold text-sm text-foreground">{article.title}</h3>
                      {article.excerpt && <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{article.excerpt}</p>}
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {article.author_name || article.author_email} · {format(new Date(article.created_at), "d MMM yyyy")}
                      </p>
                    </button>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                        adminHook.updateArticle(article.id, { is_published: !article.is_published });
                      }}>
                        {article.is_published ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingArticleId(article.id); setShowEditor(true); }}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEmailArticleId(article.id)}>
                        <Mail className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => {
                        if (confirm("Delete this article?")) adminHook.deleteArticle(article.id);
                      }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── Customer: Premium Press Release View ───
  return (
    <div className="min-h-screen bg-background pb-24">
      <CustomerHeader />

      {/* Hero masthead */}
      <div className="bg-primary text-primary-foreground">
        <div className="max-w-3xl mx-auto px-6 sm:px-8 py-10 sm:py-16">
          <p className="text-xs sm:text-sm font-body font-light tracking-[0.25em] uppercase text-primary-foreground/60 mb-3">
            Investor Communications
          </p>
          <h1 className="font-display text-3xl sm:text-5xl font-medium leading-tight tracking-tight">
            Updates &<br className="hidden sm:block" /> Announcements
          </h1>
          <div className="mt-6 h-px w-16 bg-primary-foreground/20" />
          <p className="mt-4 text-sm sm:text-base text-primary-foreground/70 max-w-md leading-relaxed font-mono font-medium">
            Official communications from LakeCity tech team.
          </p>
        </div>
      </div>

      {/* Articles feed */}
      <div className="max-w-3xl mx-auto px-6 sm:px-8 py-8 sm:py-12">
        {customerHook.articles.length === 0 ? (
          <div className="text-center py-20">
            <div className="h-px w-12 bg-border mx-auto mb-8" />
            <p className="font-display text-lg text-muted-foreground italic">
              No communications yet.
            </p>
            <p className="text-sm text-muted-foreground/60 mt-2 font-body">Check back soon for updates.</p>
            <div className="h-px w-12 bg-border mx-auto mt-8" />
          </div>
        ) : (
          <div className="space-y-0">
            {customerHook.articles.map((article, index) => (
              <ArticleCard
                key={article.id}
                article={article}
                readStatus={customerHook.readStatuses[article.id]}
                isFirst={index === 0}
                onClick={() => {
                  setSelectedArticleId(article.id);
                  if (!customerHook.readStatuses[article.id]?.is_read) {
                    customerHook.toggleReadStatus(article.id);
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
};

export default Updates;
