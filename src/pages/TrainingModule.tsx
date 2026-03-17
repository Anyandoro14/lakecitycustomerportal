import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowRight, CheckCircle2, XCircle, Send,
  MessageSquare, Lightbulb, Image, Video, GraduationCap, Bot, User,
} from "lucide-react";
import { getModules, TrainingPath, TrainingModule as TModule } from "@/lib/training-modules";
import { useTrainingProgress } from "@/hooks/useTrainingProgress";

const TrainingModule = () => {
  const { path, moduleId } = useParams<{ path: string; moduleId: string }>();
  const navigate = useNavigate();
  const trainingPath = (path || "lead") as TrainingPath;
  const modules = getModules(trainingPath);
  const module = modules.find((m) => m.id === moduleId);
  const { progress, startModule, completeModule } = useTrainingProgress(trainingPath);

  const [currentSection, setCurrentSection] = useState(0);
  const [showQuiz, setShowQuiz] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizScore, setQuizScore] = useState(0);

  // AI Chat state
  const [chatMessages, setChatMessages] = useState<{ role: string; content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Question/Suggestion
  const [questionText, setQuestionText] = useState("");
  const [questionType, setQuestionType] = useState<"question" | "suggestion">("question");

  useEffect(() => {
    if (module && progress[module.id]?.status !== "completed" && progress[module.id]?.status !== "in_progress") {
      startModule(module.id);
    }
  }, [module, progress]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  if (!module) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Module not found</p>
          <Button onClick={() => navigate("/training")}>Back to Training Center</Button>
        </div>
      </div>
    );
  }

  const sectionProgress = Math.round(((currentSection + 1) / module.sections.length) * 100);

  const handleQuizSubmit = () => {
    let correct = 0;
    module.quiz.forEach((q) => {
      if (quizAnswers[q.id] === q.correctIndex) correct++;
    });
    const score = Math.round((correct / module.quiz.length) * 100);
    const passed = score >= 80;
    setQuizScore(score);
    setQuizSubmitted(true);
    completeModule(module.id, score, passed);

    if (passed) {
      toast.success(`Congratulations! You scored ${score}% and passed this module.`);
    } else {
      toast.error(`You scored ${score}%. You need 80% to pass. Review the material and try again.`);
    }
  };

  const handleRetryQuiz = () => {
    setQuizAnswers({});
    setQuizSubmitted(false);
    setQuizScore(0);
  };

  const handleSendChat = async () => {
    if (!chatInput.trim()) return;
    const userMsg = { role: "user", content: chatInput };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setChatLoading(true);

    try {
      const response = await supabase.functions.invoke("training-ai-assistant", {
        body: {
          messages: [...chatMessages, userMsg].map((m) => ({ role: m.role, content: m.content })),
          moduleId: module.id,
          moduleTitle: module.title,
        },
      });

      if (response.error) throw response.error;
      const reply = response.data?.reply || "I'm sorry, I couldn't process that. Please try again.";
      setChatMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: "I'm having trouble responding right now. Please try again or use the 'Ask a Question' feature to reach the team directly." },
      ]);
    }
    setChatLoading(false);
  };

  const handleSubmitQuestion = async () => {
    if (!questionText.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("training_questions").insert({
      user_id: user?.id,
      user_email: user?.email,
      module_id: module.id,
      question_type: questionType,
      content: questionText,
    });
    toast.success(questionType === "question" ? "Your question has been submitted and will be escalated to the training lead." : "Thank you for your suggestion!");
    setQuestionText("");
  };

  const currentModuleIdx = modules.findIndex((m) => m.id === module.id);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-primary text-primary-foreground shadow-lg sticky top-0 z-10">
        <div className="max-w-full mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => navigate("/training")} className="text-primary-foreground hover:bg-primary-foreground/10">
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Separator orientation="vertical" className="h-6 bg-primary-foreground/20" />
              <div>
                <span className="text-xs text-primary-foreground/60 uppercase tracking-wide">Module {module.number}</span>
                <h1 className="text-sm font-semibold">{module.title}</h1>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-2 text-xs text-primary-foreground/70">
                <span>Progress:</span>
                <Progress value={showQuiz ? 100 : sectionProgress} className="w-32 h-2" />
                <span>{showQuiz ? "Quiz" : `${currentSection + 1}/${module.sections.length}`}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content - Split View */}
      <div className="flex h-[calc(100vh-60px)]">
        {/* Left: Content Panel */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto p-6">
            {!showQuiz ? (
              <>
                {/* Module Objective */}
                {currentSection === 0 && (
                  <Card className="mb-6 border-primary/20 bg-primary/5">
                    <CardContent className="py-4">
                      <div className="flex items-start gap-3">
                        <GraduationCap className="h-5 w-5 text-primary mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-primary">Learning Objective</p>
                          <p className="text-sm text-foreground mt-1">{module.objective}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Section Content */}
                <div className="mb-8">
                  <h2 className="text-2xl font-bold text-foreground mb-4">
                    {module.sections[currentSection].title}
                  </h2>
                  <div className="prose prose-sm max-w-none text-foreground">
                    {module.sections[currentSection].content.split("\n\n").map((paragraph, i) => (
                      <div key={i} className="mb-4">
                        {paragraph.split("\n").map((line, j) => {
                          if (line.startsWith("**") && line.endsWith("**")) {
                            return <p key={j} className="font-bold text-foreground">{line.replace(/\*\*/g, "")}</p>;
                          }
                          if (line.startsWith("- ")) {
                            return <li key={j} className="ml-4 text-foreground/90">{line.slice(2).replace(/\*\*(.*?)\*\*/g, "$1")}</li>;
                          }
                          if (line.match(/^\d+\./)) {
                            return <li key={j} className="ml-4 list-decimal text-foreground/90">{line.replace(/^\d+\.\s*/, "").replace(/\*\*(.*?)\*\*/g, "$1")}</li>;
                          }
                          return <p key={j} className="text-foreground/90">{line.replace(/\*\*(.*?)\*\*/g, "$1")}</p>;
                        })}
                      </div>
                    ))}
                  </div>

                  {/* Placeholders for screenshots/videos */}
                  {module.sections[currentSection].screenshotPlaceholder && (
                    <Card className="mt-6 border-dashed border-2 border-muted">
                      <CardContent className="py-8 text-center">
                        <Image className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                        <p className="text-sm text-muted-foreground">{module.sections[currentSection].screenshotPlaceholder}</p>
                        <Badge variant="outline" className="mt-2">Screenshot Placeholder</Badge>
                      </CardContent>
                    </Card>
                  )}
                  {module.sections[currentSection].videoPlaceholder && (
                    <Card className="mt-6 border-dashed border-2 border-muted">
                      <CardContent className="py-8 text-center">
                        <Video className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                        <p className="text-sm text-muted-foreground">{module.sections[currentSection].videoPlaceholder}</p>
                        <Badge variant="outline" className="mt-2">Video Placeholder</Badge>
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* Section Navigation */}
                <div className="flex items-center justify-between py-4 border-t">
                  <Button
                    variant="outline"
                    onClick={() => setCurrentSection((s) => s - 1)}
                    disabled={currentSection === 0}
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" /> Previous Section
                  </Button>
                  {currentSection < module.sections.length - 1 ? (
                    <Button onClick={() => setCurrentSection((s) => s + 1)}>
                      Next Section <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  ) : (
                    <Button onClick={() => setShowQuiz(true)} className="bg-green-600 hover:bg-green-700">
                      Take Knowledge Check <CheckCircle2 className="h-4 w-4 ml-2" />
                    </Button>
                  )}
                </div>

                {/* Ask Question / Suggestion */}
                <Card className="mt-8">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Ask a Question or Leave a Suggestion
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-4 mb-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="qtype" checked={questionType === "question"} onChange={() => setQuestionType("question")} className="accent-primary" />
                        <span className="text-sm">Question</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="qtype" checked={questionType === "suggestion"} onChange={() => setQuestionType("suggestion")} className="accent-primary" />
                        <span className="text-sm">Suggestion</span>
                      </label>
                    </div>
                    <Textarea
                      value={questionText}
                      onChange={(e) => setQuestionText(e.target.value)}
                      placeholder={questionType === "question" ? "Type your question here..." : "Share your suggestion..."}
                      rows={3}
                    />
                    <Button size="sm" className="mt-2" onClick={handleSubmitQuestion} disabled={!questionText.trim()}>
                      <Send className="h-3 w-3 mr-1" /> Submit
                    </Button>
                  </CardContent>
                </Card>
              </>
            ) : (
              /* Quiz Section */
              <div>
                <div className="flex items-center gap-3 mb-6">
                  <GraduationCap className="h-6 w-6 text-primary" />
                  <h2 className="text-2xl font-bold text-foreground">Knowledge Check</h2>
                  <Badge variant="outline">Pass: ≥80%</Badge>
                </div>

                {module.quiz.map((q, idx) => (
                  <Card key={q.id} className={`mb-4 ${quizSubmitted ? (quizAnswers[q.id] === q.correctIndex ? "border-green-300" : "border-destructive/50") : ""}`}>
                    <CardContent className="py-4">
                      <p className="font-medium text-foreground mb-3">
                        {idx + 1}. {q.question}
                      </p>
                      <RadioGroup
                        value={quizAnswers[q.id]?.toString()}
                        onValueChange={(val) => !quizSubmitted && setQuizAnswers((prev) => ({ ...prev, [q.id]: parseInt(val) }))}
                        disabled={quizSubmitted}
                      >
                        {q.options.map((opt, optIdx) => (
                          <div key={optIdx} className={`flex items-center space-x-2 p-2 rounded ${
                            quizSubmitted && optIdx === q.correctIndex ? "bg-green-50" : ""
                          } ${quizSubmitted && quizAnswers[q.id] === optIdx && optIdx !== q.correctIndex ? "bg-red-50" : ""}`}>
                            <RadioGroupItem value={optIdx.toString()} id={`${q.id}-${optIdx}`} />
                            <Label htmlFor={`${q.id}-${optIdx}`} className="cursor-pointer flex-1">{opt}</Label>
                            {quizSubmitted && optIdx === q.correctIndex && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                            {quizSubmitted && quizAnswers[q.id] === optIdx && optIdx !== q.correctIndex && <XCircle className="h-4 w-4 text-destructive" />}
                          </div>
                        ))}
                      </RadioGroup>
                      {quizSubmitted && (
                        <p className="text-sm text-muted-foreground mt-2 italic bg-muted/30 p-2 rounded">{q.explanation}</p>
                      )}
                    </CardContent>
                  </Card>
                ))}

                <div className="flex items-center gap-4 mt-6">
                  {!quizSubmitted ? (
                    <>
                      <Button variant="outline" onClick={() => setShowQuiz(false)}>
                        <ArrowLeft className="h-4 w-4 mr-2" /> Back to Content
                      </Button>
                      <Button
                        onClick={handleQuizSubmit}
                        disabled={Object.keys(quizAnswers).length < module.quiz.length}
                      >
                        Submit Answers
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className={`text-lg font-bold ${quizScore >= 80 ? "text-green-600" : "text-destructive"}`}>
                        Score: {quizScore}%
                      </div>
                      {quizScore >= 80 ? (
                        currentModuleIdx < modules.length - 1 ? (
                          <Button onClick={() => navigate(`/training/${trainingPath}/${modules[currentModuleIdx + 1].id}`)}>
                            Next Module <ArrowRight className="h-4 w-4 ml-2" />
                          </Button>
                        ) : (
                          <Button onClick={() => navigate("/training")} className="bg-green-600 hover:bg-green-700">
                            🎉 Training Complete!
                          </Button>
                        )
                      ) : (
                        <Button variant="outline" onClick={handleRetryQuiz}>
                          Retry Quiz
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: AI Assistant Panel */}
        <div className="hidden lg:flex w-96 border-l bg-card flex-col">
          <div className="p-4 border-b bg-primary/5">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-foreground">Training Assistant</h3>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Ask me anything about this module or LakeCity accounting processes
            </p>
          </div>

          <ScrollArea className="flex-1 p-4">
            {chatMessages.length === 0 && (
              <div className="text-center py-8">
                <Bot className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  I'm your AI training assistant. Ask me questions about the module content, LakeCity processes, or accounting concepts.
                </p>
                <div className="mt-4 space-y-2">
                  {["What is segregation of duties?", "Explain the payment recording flow", "How does the audit trail work?"].map((q) => (
                    <Button
                      key={q}
                      variant="outline"
                      size="sm"
                      className="w-full text-xs justify-start"
                      onClick={() => { setChatInput(q); }}
                    >
                      <Lightbulb className="h-3 w-3 mr-2 flex-shrink-0" /> {q}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {chatMessages.map((msg, idx) => (
              <div key={idx} className={`flex gap-2 mb-4 ${msg.role === "user" ? "justify-end" : ""}`}>
                {msg.role === "assistant" && <Bot className="h-6 w-6 text-primary flex-shrink-0 mt-1" />}
                <div className={`rounded-lg px-3 py-2 max-w-[85%] text-sm ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground"
                }`}>
                  {msg.content}
                </div>
                {msg.role === "user" && <User className="h-6 w-6 text-muted-foreground flex-shrink-0 mt-1" />}
              </div>
            ))}
            {chatLoading && (
              <div className="flex gap-2 mb-4">
                <Bot className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
                <div className="bg-muted rounded-lg px-3 py-2 text-sm text-muted-foreground animate-pulse">
                  Thinking...
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </ScrollArea>

          <div className="p-4 border-t">
            <div className="flex gap-2">
              <Textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask a question..."
                rows={2}
                className="resize-none text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendChat(); }
                }}
              />
              <Button size="sm" onClick={handleSendChat} disabled={!chatInput.trim() || chatLoading} className="self-end">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrainingModule;
