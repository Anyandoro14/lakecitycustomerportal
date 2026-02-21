import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Article } from "@/hooks/useArticles";
import { Save, X } from "lucide-react";

interface ArticleEditorProps {
  article?: Article;
  onSave: (data: Partial<Article>) => Promise<boolean>;
  onCancel: () => void;
}

const ArticleEditor = ({ article, onSave, onCancel }: ArticleEditorProps) => {
  const [title, setTitle] = useState(article?.title || "");
  const [excerpt, setExcerpt] = useState(article?.excerpt || "");
  const [content, setContent] = useState(article?.content || "");
  const [category, setCategory] = useState(article?.category || "update");
  const [authorName, setAuthorName] = useState(article?.author_name || "LakeCity Team");
  const [isPublished, setIsPublished] = useState(article?.is_published || false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    const success = await onSave({
      title: title.trim(),
      excerpt: excerpt.trim() || null,
      content: content.trim(),
      category,
      author_name: authorName.trim() || null,
      is_published: isPublished,
    });
    setSaving(false);
    if (success) onCancel();
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1" placeholder="Article title..." />
        </div>
        <div>
          <Label className="text-xs">Author Name</Label>
          <Input value={authorName} onChange={(e) => setAuthorName(e.target.value)} className="mt-1" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="welcome">Welcome</SelectItem>
              <SelectItem value="update">Portal Update</SelectItem>
              <SelectItem value="announcement">Announcement</SelectItem>
              <SelectItem value="feature">New Feature</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end gap-3 pb-1">
          <div className="flex items-center gap-2">
            <Switch checked={isPublished} onCheckedChange={setIsPublished} />
            <Label className="text-xs cursor-pointer">Publish immediately</Label>
          </div>
        </div>
      </div>

      <div>
        <Label className="text-xs">Excerpt (shown in list preview)</Label>
        <Input value={excerpt} onChange={(e) => setExcerpt(e.target.value)} className="mt-1" placeholder="Brief summary..." />
      </div>

      <div>
        <Label className="text-xs">Content</Label>
        <p className="text-[10px] text-muted-foreground mt-0.5 mb-1">
          Use ## for headings, ### for subheadings, - for bullet points, {">"} for quotes. Separate paragraphs with blank lines.
        </p>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="mt-1 min-h-[250px] font-mono text-xs resize-y"
          placeholder="Write your article content here..."
        />
      </div>

      <div className="flex gap-2 justify-end pt-2">
        <Button variant="ghost" size="sm" onClick={onCancel}><X className="h-4 w-4 mr-1" /> Cancel</Button>
        <Button size="sm" onClick={handleSave} disabled={saving || !title.trim() || !content.trim()} className="gap-1.5">
          <Save className="h-3.5 w-3.5" /> {saving ? "Saving..." : article ? "Update Article" : "Create Article"}
        </Button>
      </div>
    </div>
  );
};

export default ArticleEditor;
