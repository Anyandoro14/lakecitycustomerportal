import { format } from "date-fns";
import { ArrowLeft, BookOpen, BookOpenCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Article, ArticleReadStatus } from "@/hooks/useArticles";
import ArticleFeedbackForm from "./ArticleFeedbackForm";

interface ArticleDetailProps {
  article: Article;
  readStatus?: ArticleReadStatus;
  onBack: () => void;
  onToggleRead: (articleId: string) => void;
  onSubmitFeedback: (articleId: string, comment: string) => Promise<boolean>;
}

const ArticleDetail = ({ article, readStatus, onBack, onToggleRead, onSubmitFeedback }: ArticleDetailProps) => {
  const isRead = readStatus?.is_read || false;
  const publishedDate = article.published_at
    ? format(new Date(article.published_at), "d MMMM yyyy")
    : format(new Date(article.created_at), "d MMMM yyyy");

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky header — email app style */}
      <div className="sticky top-0 z-40 bg-card/95 backdrop-blur-sm border-b border-border px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 -ml-2">
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Updates</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onToggleRead(article.id)}
            className="gap-1.5 text-xs"
          >
            {isRead ? (
              <>
                <BookOpen className="h-4 w-4" />
                Mark Unread
              </>
            ) : (
              <>
                <BookOpenCheck className="h-4 w-4" />
                Mark as Read
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Article content */}
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 pb-32">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-medium uppercase tracking-wider text-secondary">
              {article.category === "welcome" ? "Welcome" : "Portal Update"}
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground leading-tight">
            {article.title}
          </h1>
          <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
            <span className="font-medium">{article.author_name || "LakeCity Team"}</span>
            <span>·</span>
            <span>{publishedDate}</span>
          </div>
        </div>

        {/* Content — render as HTML-safe paragraphs */}
        <div className="prose-article text-sm leading-relaxed text-foreground space-y-4">
          {article.content.split("\n\n").map((paragraph, i) => {
            if (paragraph.startsWith("## ")) {
              return <h2 key={i} className="text-lg font-semibold mt-8 mb-3 text-foreground">{paragraph.replace("## ", "")}</h2>;
            }
            if (paragraph.startsWith("### ")) {
              return <h3 key={i} className="text-base font-semibold mt-6 mb-2 text-foreground">{paragraph.replace("### ", "")}</h3>;
            }
            if (paragraph.startsWith("- ") || paragraph.startsWith("• ")) {
              const items = paragraph.split("\n").filter(Boolean);
              return (
                <ul key={i} className="space-y-1.5 ml-1">
                  {items.map((item, j) => (
                    <li key={j} className="flex items-start gap-2 text-muted-foreground">
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-secondary flex-shrink-0" />
                      <span>{item.replace(/^[-•]\s*/, "")}</span>
                    </li>
                  ))}
                </ul>
              );
            }
            if (paragraph.startsWith("> ")) {
              return (
                <blockquote key={i} className="border-l-2 border-secondary pl-4 italic text-muted-foreground">
                  {paragraph.replace(/^>\s*/, "")}
                </blockquote>
              );
            }
            return (
              <p key={i} className="text-muted-foreground">{paragraph}</p>
            );
          })}
        </div>

        {/* Feedback form */}
        <ArticleFeedbackForm articleId={article.id} onSubmit={onSubmitFeedback} />
      </div>
    </div>
  );
};

export default ArticleDetail;
