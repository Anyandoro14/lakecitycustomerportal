import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface Article {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  category: string;
  author_email: string;
  author_name: string | null;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ArticleFeedback {
  id: string;
  article_id: string;
  user_id: string | null;
  stand_number: string | null;
  customer_name: string | null;
  comment: string;
  created_at: string;
}

export interface ArticleReadStatus {
  article_id: string;
  is_read: boolean;
  read_at: string | null;
  dismissed_ribbon: boolean;
}

export const useArticles = () => {
  const [articles, setArticles] = useState<Article[]>([]);
  const [readStatuses, setReadStatuses] = useState<Record<string, ArticleReadStatus>>({});
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchArticles = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("articles")
        .select("*")
        .eq("is_published", true)
        .order("published_at", { ascending: false });

      if (error) throw error;
      setArticles((data as Article[]) || []);
    } catch (error: any) {
      console.error("Error fetching articles:", error);
    }
  }, []);

  const fetchReadStatuses = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("article_read_status")
        .select("article_id, is_read, read_at, dismissed_ribbon")
        .eq("user_id", user.id);

      if (error) throw error;
      const map: Record<string, ArticleReadStatus> = {};
      (data || []).forEach((s: any) => {
        map[s.article_id] = s;
      });
      setReadStatuses(map);
    } catch (error: any) {
      console.error("Error fetching read statuses:", error);
    }
  }, []);

  const toggleReadStatus = useCallback(async (articleId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const current = readStatuses[articleId];
      const newIsRead = !current?.is_read;

      const { error } = await supabase
        .from("article_read_status")
        .upsert({
          article_id: articleId,
          user_id: user.id,
          is_read: newIsRead,
          read_at: newIsRead ? new Date().toISOString() : null,
        }, { onConflict: "article_id,user_id" });

      if (error) throw error;
      await fetchReadStatuses();
    } catch (error: any) {
      toast({ title: "Error", description: "Failed to update read status", variant: "destructive" });
    }
  }, [readStatuses, fetchReadStatuses, toast]);

  const dismissRibbon = useCallback(async (articleId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from("article_read_status")
        .upsert({
          article_id: articleId,
          user_id: user.id,
          dismissed_ribbon: true,
          is_read: readStatuses[articleId]?.is_read || false,
        }, { onConflict: "article_id,user_id" });

      if (error) throw error;
      await fetchReadStatuses();
    } catch (error: any) {
      console.error("Error dismissing ribbon:", error);
    }
  }, [readStatuses, fetchReadStatuses]);

  const submitFeedback = useCallback(async (articleId: string, comment: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: profile } = await supabase
        .from("profiles")
        .select("stand_number, full_name")
        .eq("id", user.id)
        .maybeSingle();

      const { error } = await supabase
        .from("article_feedback")
        .insert({
          article_id: articleId,
          user_id: user.id,
          stand_number: profile?.stand_number || null,
          customer_name: profile?.full_name || null,
          comment: comment.trim(),
        });

      if (error) throw error;

      // Send notification email to info@lakecity.co.zw
      try {
        await supabase.functions.invoke("send-article-feedback-notification", {
          body: {
            articleId,
            comment: comment.trim(),
            customerName: profile?.full_name || "Anonymous",
            standNumber: profile?.stand_number || "N/A",
          },
        });
      } catch {
        // Non-critical — feedback was still saved
      }

      return true;
    } catch (error: any) {
      toast({ title: "Error", description: "Failed to submit feedback", variant: "destructive" });
      return false;
    }
  }, [toast]);

  const getUnreadArticles = useCallback(() => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    return articles.filter((a) => {
      const published = new Date(a.published_at || a.created_at);
      if (published < sevenDaysAgo) return false;
      const status = readStatuses[a.id];
      if (status?.dismissed_ribbon) return false;
      return true;
    });
  }, [articles, readStatuses]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchArticles(), fetchReadStatuses()]);
      setLoading(false);
    };
    load();
  }, [fetchArticles, fetchReadStatuses]);

  return {
    articles,
    readStatuses,
    loading,
    toggleReadStatus,
    dismissRibbon,
    submitFeedback,
    getUnreadArticles,
    refetch: fetchArticles,
  };
};

// Hook for internal users to manage articles
export const useArticleAdmin = () => {
  const [articles, setArticles] = useState<Article[]>([]);
  const [feedback, setFeedback] = useState<ArticleFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchAllArticles = useCallback(async () => {
    const { data, error } = await supabase
      .from("articles")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      console.error(error);
      return;
    }
    setArticles((data as Article[]) || []);
  }, []);

  const fetchFeedback = useCallback(async (articleId?: string) => {
    let query = supabase
      .from("article_feedback")
      .select("*")
      .order("created_at", { ascending: false });
    
    if (articleId) query = query.eq("article_id", articleId);

    const { data, error } = await query;
    if (error) {
      console.error(error);
      return;
    }
    setFeedback((data as ArticleFeedback[]) || []);
  }, []);

  const createArticle = useCallback(async (article: Partial<Article>) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const slug = (article.title || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        + "-" + Date.now().toString(36);

      const { error } = await supabase.from("articles").insert({
        title: article.title!,
        slug,
        excerpt: article.excerpt || null,
        content: article.content!,
        category: article.category || "update",
        author_email: user.email!,
        author_name: article.author_name || null,
        is_published: article.is_published || false,
        published_at: article.is_published ? new Date().toISOString() : null,
      });

      if (error) throw error;
      await fetchAllArticles();
      toast({ title: "Article created" });
      return true;
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return false;
    }
  }, [fetchAllArticles, toast]);

  const updateArticle = useCallback(async (id: string, updates: Partial<Article>) => {
    try {
      const updateData: any = { ...updates };
      if (updates.is_published && !updates.published_at) {
        updateData.published_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("articles")
        .update(updateData)
        .eq("id", id);

      if (error) throw error;
      await fetchAllArticles();
      toast({ title: "Article updated" });
      return true;
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return false;
    }
  }, [fetchAllArticles, toast]);

  const deleteArticle = useCallback(async (id: string) => {
    try {
      const { error } = await supabase.from("articles").delete().eq("id", id);
      if (error) throw error;
      await fetchAllArticles();
      toast({ title: "Article deleted" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  }, [fetchAllArticles, toast]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchAllArticles(), fetchFeedback()]);
      setLoading(false);
    };
    load();
  }, [fetchAllArticles, fetchFeedback]);

  return {
    articles,
    feedback,
    loading,
    createArticle,
    updateArticle,
    deleteArticle,
    fetchFeedback,
    refetch: fetchAllArticles,
  };
};
