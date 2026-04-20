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

const renderInline = (text: string) => {
  // Tokenize for [label](url) and **bold**
  const regex = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*/g;
  const nodes: (string | JSX.Element)[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    if (match[1] && match[2]) {
      nodes.push(
        <a
          key={key++}
          href={match[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-foreground underline underline-offset-4 decoration-secondary hover:decoration-foreground transition-colors"
        >
          {match[1]}
        </a>
      );
    } else if (match[3]) {
      nodes.push(<strong key={key++} className="font-semibold text-foreground">{match[3]}</strong>);
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
};

const ArticleDetail = ({ article, readStatus, onBack, onToggleRead, onSubmitFeedback }: ArticleDetailProps) => {
  const isRead = readStatus?.is_read || false;
  const publishedDate = article.published_at
    ? format(new Date(article.published_at), "d MMMM yyyy")
    : format(new Date(article.created_at), "d MMMM yyyy");

  const categoryLabel = article.category === "welcome" ? "Welcome" : "Customer Portal Announcement";

  return (
    <div className="min-h-screen bg-background">
      {/* Minimal sticky nav */}
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="max-w-3xl mx-auto px-6 sm:px-8 py-3 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-2 -ml-3 text-muted-foreground hover:text-foreground font-body text-sm">
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">All Updates</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onToggleRead(article.id)}
            className="gap-1.5 text-xs font-body text-muted-foreground hover:text-foreground"
          >
            {isRead ? (
              <>
                <BookOpen className="h-4 w-4" />
                <span className="hidden sm:inline">Mark Unread</span>
              </>
            ) : (
              <>
                <BookOpenCheck className="h-4 w-4" />
                <span className="hidden sm:inline">Mark as Read</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Article hero */}
      <div className="bg-primary text-primary-foreground">
        <div className="max-w-3xl mx-auto px-6 sm:px-8 py-10 sm:py-16">
          {/* Category tag */}
          <p className="text-[11px] sm:text-xs font-body font-medium tracking-[0.25em] uppercase text-primary-foreground/50 mb-6">
            {categoryLabel}
          </p>

          {/* Title */}
          <h1 className="font-display text-2xl sm:text-4xl lg:text-5xl font-medium leading-tight tracking-tight max-w-2xl">
            {article.title}
          </h1>

          {/* Meta */}
          <div className="mt-8 flex items-center gap-3">
            <div className="h-px flex-1 max-w-[40px] bg-primary-foreground/20" />
            <div className="flex items-center gap-2 text-xs sm:text-sm font-body text-primary-foreground/50">
              <span className="font-medium text-primary-foreground/70">{article.author_name || "Tech at LakeCity"}</span>
              <span className="text-primary-foreground/30">·</span>
              <span>{publishedDate}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Article body */}
      <div className="max-w-3xl mx-auto px-6 sm:px-8 py-10 sm:py-16 pb-32">
        {/* Opening line accent */}
        <div className="h-px w-12 bg-secondary mb-10" />

        {/* Content */}
        <div className="space-y-6">
          {article.content.split("\n\n").map((paragraph, i) => {
            if (paragraph.startsWith("## ")) {
              return (
                <h2 key={i} className="font-display text-xl sm:text-2xl font-semibold mt-12 mb-4 text-foreground tracking-tight">
                  {paragraph.replace("## ", "")}
                </h2>
              );
            }
            if (paragraph.startsWith("### ")) {
              return (
                <h3 key={i} className="font-display text-lg sm:text-xl font-semibold mt-10 mb-3 text-foreground tracking-tight">
                  {paragraph.replace("### ", "")}
                </h3>
              );
            }
            if (paragraph.startsWith("- ") || paragraph.startsWith("• ")) {
              const items = paragraph.split("\n").filter(Boolean);
              return (
                <ul key={i} className="space-y-3 ml-1 my-6">
                  {items.map((item, j) => (
                    <li key={j} className="flex items-start gap-4 font-body text-base text-muted-foreground leading-relaxed">
                      <span className="mt-2.5 h-1 w-1 rounded-full bg-secondary flex-shrink-0" />
                      <span>{item.replace(/^[-•]\s*/, "")}</span>
                    </li>
                  ))}
                </ul>
              );
            }
            if (paragraph.startsWith("> ")) {
              return (
                <blockquote key={i} className="border-l-2 border-secondary pl-6 my-8 font-display italic text-lg text-foreground/80 leading-relaxed">
                  {paragraph.replace(/^>\s*/, "")}
                </blockquote>
              );
            }
            return (
              <p key={i} className={`font-body text-base sm:text-[17px] leading-[1.8] text-muted-foreground ${
                i === 0 ? "text-foreground/90 font-light text-lg sm:text-xl leading-[1.7]" : ""
              }`}>
                {renderInline(paragraph)}
              </p>
            );
          })}
        </div>

        {/* Closing line */}
        <div className="mt-16 flex items-center gap-4">
          <div className="h-px flex-1 bg-border" />
          <span className="text-[10px] font-body tracking-[0.3em] uppercase text-muted-foreground/40">
            End of Communication
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>

        {/* Feedback */}
        <ArticleFeedbackForm articleId={article.id} onSubmit={onSubmitFeedback} />
      </div>
    </div>
  );
};

export default ArticleDetail;
