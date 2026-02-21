import { format } from "date-fns";
import { Circle, CheckCircle2, ChevronRight } from "lucide-react";
import { Article, ArticleReadStatus } from "@/hooks/useArticles";

interface ArticleCardProps {
  article: Article;
  readStatus?: ArticleReadStatus;
  onClick: () => void;
}

const ArticleCard = ({ article, readStatus, onClick }: ArticleCardProps) => {
  const isRead = readStatus?.is_read || false;
  const publishedDate = article.published_at
    ? format(new Date(article.published_at), "d MMM yyyy")
    : format(new Date(article.created_at), "d MMM yyyy");

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3.5 flex items-start gap-3 border-b border-border transition-colors hover:bg-muted/30 active:bg-muted/50 ${
        !isRead ? "bg-card" : "bg-background"
      }`}
    >
      {/* Read indicator */}
      <div className="mt-1 flex-shrink-0">
        {isRead ? (
          <CheckCircle2 className="h-4 w-4 text-muted-foreground/40" />
        ) : (
          <Circle className="h-4 w-4 fill-primary text-primary" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <p className={`text-sm truncate ${!isRead ? "font-semibold text-foreground" : "font-medium text-muted-foreground"}`}>
            {article.author_name || "LakeCity Team"}
          </p>
          <span className="text-xs text-muted-foreground flex-shrink-0">{publishedDate}</span>
        </div>
        <p className={`text-sm mt-0.5 truncate ${!isRead ? "font-semibold text-foreground" : "text-foreground"}`}>
          {article.title}
        </p>
        {article.excerpt && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{article.excerpt}</p>
        )}
      </div>

      <ChevronRight className="h-4 w-4 text-muted-foreground/50 mt-1 flex-shrink-0" />
    </button>
  );
};

export default ArticleCard;
