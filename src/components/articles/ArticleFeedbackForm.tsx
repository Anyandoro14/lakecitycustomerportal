import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, CheckCircle } from "lucide-react";

interface ArticleFeedbackFormProps {
  articleId: string;
  onSubmit: (articleId: string, comment: string) => Promise<boolean>;
}

const ArticleFeedbackForm = ({ articleId, onSubmit }: ArticleFeedbackFormProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!comment.trim() || comment.trim().length > 2000) return;
    setSubmitting(true);
    const success = await onSubmit(articleId, comment);
    setSubmitting(false);
    if (success) {
      setSubmitted(true);
      setComment("");
      setTimeout(() => {
        setSubmitted(false);
        setIsOpen(false);
      }, 4000);
    }
  };

  if (submitted) {
    return (
      <div className="mt-12 py-10 text-center">
        <CheckCircle className="h-8 w-8 text-secondary mx-auto mb-4" />
        <p className="font-display text-lg font-medium text-foreground">Thank you for your feedback</p>
        <p className="text-sm font-body text-muted-foreground mt-2 max-w-sm mx-auto leading-relaxed">
          Our team reviews all feedback to improve your experience.
        </p>
      </div>
    );
  }

  if (!isOpen) {
    return (
      <div className="mt-12">
        <button
          onClick={() => setIsOpen(true)}
          className="group w-full py-6 text-center transition-all duration-300"
        >
          <p className="text-xs font-body tracking-[0.2em] uppercase text-muted-foreground/50 mb-2 group-hover:text-secondary transition-colors">
            We value your perspective
          </p>
          <p className="font-display text-base sm:text-lg text-foreground/70 italic group-hover:text-foreground transition-colors">
            Share your thoughts on this communication
          </p>
        </button>
      </div>
    );
  }

  return (
    <div className="mt-12 space-y-5">
      <div>
        <p className="font-display text-lg font-medium text-foreground">Your Feedback</p>
        <p className="text-sm font-body text-muted-foreground mt-1.5 leading-relaxed">
          Shared privately with our team and directors. Your input helps shape future communications.
        </p>
      </div>
      <Textarea
        placeholder="Share your thoughts..."
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={2000}
        className="min-h-[120px] resize-none text-base font-body leading-relaxed border-border/50 focus:border-secondary"
      />
      <div className="flex items-center justify-between">
        <span className="text-xs font-body text-muted-foreground/40">{comment.length}/2,000</span>
        <div className="flex gap-3">
          <Button variant="ghost" size="sm" onClick={() => { setIsOpen(false); setComment(""); }} className="font-body text-sm">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!comment.trim() || submitting}
            className="gap-2 font-body text-sm px-6"
          >
            <Send className="h-3.5 w-3.5" />
            {submitting ? "Sending..." : "Submit"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ArticleFeedbackForm;
