import { X, Newspaper } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Article } from "@/hooks/useArticles";

interface ArticleRibbonProps {
  articles: Article[];
  onDismiss: (articleId: string) => void;
}

const ArticleRibbon = ({ articles, onDismiss }: ArticleRibbonProps) => {
  const navigate = useNavigate();

  if (articles.length === 0) return null;

  const latest = articles[0];

  return (
    <div className="bg-primary text-primary-foreground px-4 py-2.5 flex items-center gap-3 animate-in slide-in-from-top duration-300">
      <Newspaper className="h-4 w-4 flex-shrink-0 opacity-80" />
      <button
        onClick={() => navigate("/updates")}
        className="flex-1 text-left text-sm font-medium truncate hover:underline underline-offset-2"
      >
        New: {latest.title}
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDismiss(latest.id);
        }}
        className="flex-shrink-0 p-1 rounded-full hover:bg-primary-foreground/10 transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

export default ArticleRibbon;
