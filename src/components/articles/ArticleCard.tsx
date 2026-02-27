import { format } from "date-fns";
import { Circle, ArrowRight } from "lucide-react";
import { Article, ArticleReadStatus } from "@/hooks/useArticles";

interface ArticleCardProps {
  article: Article;
  readStatus?: ArticleReadStatus;
  isFirst?: boolean;
  onClick: () => void;
}

const ArticleCard = ({ article, readStatus, isFirst, onClick }: ArticleCardProps) => {
  const isRead = readStatus?.is_read || false;
  const publishedDate = article.published_at
    ? format(new Date(article.published_at), "d MMMM yyyy")
    : format(new Date(article.created_at), "d MMMM yyyy");

  const categoryLabel = article.category === "welcome" ? "Welcome" : "Press Release";

  return (
    <button
      onClick={onClick}
      className={`group w-full text-left block transition-all duration-300 ${
        isFirst ? "" : "border-t border-border"
      }`}
    >
      <div className="py-8 sm:py-10">
        {/* Category + date row */}
        <div className="flex items-center gap-3 mb-4">
          {!isRead && (
            <Circle className="h-2 w-2 fill-secondary text-secondary flex-shrink-0" />
          )}
          <span className="text-[11px] sm:text-xs font-body font-medium tracking-[0.2em] uppercase text-secondary">
            {categoryLabel}
          </span>
          <span className="text-[11px] sm:text-xs text-muted-foreground/50 font-body">
            —
          </span>
          <span className="text-[11px] sm:text-xs text-muted-foreground/50 font-body tracking-wide">
            {publishedDate}
          </span>
        </div>

        {/* Title */}
        <h2 className={`font-display text-xl sm:text-2xl leading-snug tracking-tight transition-colors duration-300 group-hover:text-secondary ${
          !isRead ? "font-semibold text-foreground" : "font-medium text-foreground/80"
        }`}>
          {article.title}
        </h2>

        {/* Excerpt */}
        {article.excerpt && (
          <p className="mt-3 text-sm sm:text-base font-body font-light text-muted-foreground leading-relaxed line-clamp-2 max-w-xl">
            {article.excerpt}
          </p>
        )}

        {/* Read more */}
        <div className="mt-5 flex items-center gap-2 text-xs sm:text-sm font-body font-medium text-secondary tracking-wide group-hover:gap-3 transition-all duration-300">
          <span>Read full communication</span>
          <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
        </div>
      </div>
    </button>
  );
};

export default ArticleCard;
