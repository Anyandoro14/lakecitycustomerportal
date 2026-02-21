import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, Send, CheckCircle } from "lucide-react";

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
      <div className="mt-6 rounded-lg border border-border bg-card p-6 text-center">
        <CheckCircle className="h-10 w-10 text-secondary mx-auto mb-3" />
        <p className="font-semibold text-foreground">Thank you for your feedback!</p>
        <p className="text-sm text-muted-foreground mt-1">
          We've received your comment. Our team reviews all feedback to improve your experience.
        </p>
      </div>
    );
  }

  if (!isOpen) {
    return (
      <div className="mt-6">
        <Button
          variant="outline"
          onClick={() => setIsOpen(true)}
          className="w-full h-12 gap-2 text-sm border-dashed"
        >
          <MessageSquare className="h-4 w-4" />
          Share your thoughts on this article
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-lg border border-border bg-card p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold text-foreground">Leave a Comment</p>
        <p className="text-xs text-muted-foreground mt-1">
          Your feedback is anonymous and shared only with our development team and directors. 
          It won't be posted publicly. We value your input — please be patient as changes may take time to implement.
        </p>
      </div>
      <Textarea
        placeholder="Share your feedback or suggestions..."
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={2000}
        className="min-h-[100px] resize-none text-sm"
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{comment.length}/2000</span>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => { setIsOpen(false); setComment(""); }}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!comment.trim() || submitting}
            className="gap-1.5"
          >
            <Send className="h-3.5 w-3.5" />
            {submitting ? "Sending..." : "Send Feedback"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ArticleFeedbackForm;
