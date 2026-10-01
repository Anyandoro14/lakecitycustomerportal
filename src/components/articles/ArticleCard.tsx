import { format } from "date-fns";
import { ArrowRight } from "lucide-react";
import { Article, ArticleReadStatus } from "@/hooks/useArticles";
import { getCategoryLabel } from "./articleCategory";

interface ArticleCardProps {
  article: Article;
  readStatus?: ArticleReadStatus;
  isFirst?: boolean;
  onClick: () => void;
}

const ArticleCard = ({ article, readStatus, onClick }: ArticleCardProps) => {
  const isRead = readStatus?.is_read || false;
  const publishedDate = format(new Date(article.published_at || article.created_at), "d MMM yyyy");
  const categoryLabel = getCategoryLabel(article.category);
  const isNewsletter = categoryLabel === "Newsletter";

  return (
    <button
      onClick={onClick}
      className="group relative w-full text-left block rounded-2xl border border-border bg-card p-5 sm:p-7 mb-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-secondary/60 hover:shadow-md"
    >
      <span className="absolute left-0 top-6 bottom-6 w-1 rounded-r-full bg-primary opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="flex items-center gap-2.5 mb-3">
        <span
          className={`rounded-full px-2.5 py-0.5 text-[10px] sm:text-[11px] font-body font-semibold tracking-[0.15em] uppercase ${
            isNewsletter
              ? "bg-sl-gold/20 text-sl-gold-dark border border-sl-gold/35"
              : "bg-primary/10 text-primary border border-primary/15"
          }`}
        >
          {categoryLabel}
        </span>
        <span className="text-[11px] sm:text-xs text-muted-foreground font-body">{publishedDate}</span>
        {!isRead && (
          <span className="ml-auto flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-sl-gold-dark">
            <span className="h-2 w-2 rounded-full bg-sl-gold" /> New
          </span>
        )}
      </div>

      <h2
        className={`font-display text-xl sm:text-2xl leading-snug tracking-tight transition-colors group-hover:text-primary ${
          !isRead ? "font-semibold text-foreground" : "font-medium text-foreground/80"
        }`}
      >
        {article.title}
      </h2>

      {article.excerpt && (
        <p className="mt-2 text-sm sm:text-base font-body text-muted-foreground leading-relaxed line-clamp-2 max-w-xl">
          {article.excerpt}
        </p>
      )}

      <div className="mt-4 flex items-center gap-2 text-xs sm:text-sm font-body font-semibold text-primary group-hover:gap-3 transition-all">
        <span>Read more</span>
        <ArrowRight className="h-3.5 w-3.5" />
      </div>
    </button>
  );
};

export default ArticleCard;
