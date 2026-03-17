import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowRight, CheckCircle2, XCircle, Send,
  MessageSquare, Lightbulb, Image, Video, Bot, User,
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

  const [chatMessages, setChatMessages] = useState<{ role: string; content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

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
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#FAFAFA" }}>
        <div className="text-center">
          <p style={{ color: "#999", fontSize: "14px" }} className="mb-4">Module not found</p>
          <Button onClick={() => navigate("/training")} style={{ background: "#111", color: "#FFF" }}>Back to Training Center</Button>
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
    if (passed) toast.success(`You scored ${score}% — module complete.`);
    else toast.error(`You scored ${score}%. 80% required to pass.`);
  };

  const handleRetryQuiz = () => { setQuizAnswers({}); setQuizSubmitted(false); setQuizScore(0); };

  const handleSendChat = async () => {
    if (!chatInput.trim()) return;
    const userMsg = { role: "user", content: chatInput };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setChatLoading(true);
    try {
      const response = await supabase.functions.invoke("training-ai-assistant", {
        body: { messages: [...chatMessages, userMsg].map((m) => ({ role: m.role, content: m.content })), moduleId: module.id, moduleTitle: module.title },
      });
      if (response.error) throw response.error;
      setChatMessages((prev) => [...prev, { role: "assistant", content: response.data?.reply || "I couldn't process that. Please try again." }]);
    } catch {
      setChatMessages((prev) => [...prev, { role: "assistant", content: "I'm having trouble right now. Try again or use 'Ask a Question' to reach the team." }]);
    }
    setChatLoading(false);
  };

  const handleSubmitQuestion = async () => {
    if (!questionText.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("training_questions").insert({ user_id: user?.id, user_email: user?.email, module_id: module.id, question_type: questionType, content: questionText });
    toast.success(questionType === "question" ? "Question submitted — it will be escalated to the training lead." : "Thank you for your suggestion!");
    setQuestionText("");
  };

  const currentModuleIdx = modules.findIndex((m) => m.id === module.id);

  // Markdown-like renderer
  const renderContent = (text: string) => {
    return text.split("\n\n").map((paragraph, i) => (
      <div key={i} className="mb-5">
        {paragraph.split("\n").map((line, j) => {
          if (line.startsWith("**") && line.endsWith("**")) {
            return <p key={j} className="font-semibold mt-4 mb-1.5" style={{ color: "#111", fontSize: "15px" }}>{line.replace(/\*\*/g, "")}</p>;
          }
          if (line.startsWith("- ")) {
            const content = line.slice(2).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            return <li key={j} className="ml-5 mb-1" style={{ color: "#444", fontSize: "15px", lineHeight: 1.8 }} dangerouslySetInnerHTML={{ __html: content }} />;
          }
          if (line.match(/^\d+\./)) {
            const content = line.replace(/^\d+\.\s*/, "").replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            return <li key={j} className="ml-5 list-decimal mb-1" style={{ color: "#444", fontSize: "15px", lineHeight: 1.8 }} dangerouslySetInnerHTML={{ __html: content }} />;
          }
          const content = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
          return <p key={j} style={{ color: "#444", fontSize: "15px", lineHeight: 1.8 }} dangerouslySetInnerHTML={{ __html: content }} />;
        })}
      </div>
    ));
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#FAFAFA", fontFamily: "'Inter', sans-serif" }}>
      {/* Minimal header */}
      <header className="sticky top-0 z-20 flex-shrink-0" style={{ background: "#FFF", borderBottom: "1px solid #E8E8E8" }}>
        <div className="max-w-full mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/training")}
              className="flex items-center gap-1.5 text-xs uppercase tracking-[0.15em] hover:opacity-60 transition-opacity"
              style={{ color: "#999", fontWeight: 500 }}
            >
              <ArrowLeft className="h-3 w-3" /> Modules
            </button>
            <div style={{ width: "1px", height: "16px", background: "#E0E0E0" }} />
            <div>
              <span className="text-[10px] uppercase tracking-[0.15em]" style={{ color: "#BBB" }}>Module {module.number}</span>
              <h1 className="text-sm font-semibold" style={{ color: "#111" }}>{module.title}</h1>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-3">
            <span className="text-xs" style={{ color: "#BBB" }}>
              {showQuiz ? "Knowledge Check" : `Section ${currentSection + 1} of ${module.sections.length}`}
            </span>
            <div className="w-24 h-1 rounded-full overflow-hidden" style={{ background: "#E8E8E8" }}>
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${showQuiz ? 100 : sectionProgress}%`, background: "#111" }} />
            </div>
          </div>
        </div>
      </header>

      {/* Main - Split view */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-6 py-12">
            {!showQuiz ? (
              <>
                {/* Module objective - only on first section */}
                {currentSection === 0 && (
                  <div className="mb-10 p-5 rounded-xl" style={{ background: "#F5F5F5", border: "1px solid #EBEBEB" }}>
                    <p className="text-[10px] uppercase tracking-[0.2em] mb-2" style={{ color: "#999", fontWeight: 600 }}>Learning Objective</p>
                    <p className="text-sm" style={{ color: "#555", lineHeight: 1.7 }}>{module.objective}</p>
                  </div>
                )}

                {/* Section title */}
                <h2 className="text-3xl font-bold mb-8" style={{ color: "#111", fontFamily: "'Playfair Display', serif", lineHeight: 1.2 }}>
                  {module.sections[currentSection].title}
                </h2>

                {/* Content */}
                <div className="mb-10">
                  {renderContent(module.sections[currentSection].content)}
                </div>

                {/* Screenshot */}
                {module.sections[currentSection].screenshotSrc ? (
                  <div className="mt-8 mb-8 rounded-xl overflow-hidden" style={{ border: "1px solid #E8E8E8" }}>
                    <img
                      src={module.sections[currentSection].screenshotSrc}
                      alt={module.sections[currentSection].screenshotPlaceholder || "Training screenshot"}
                      className="w-full h-auto"
                    />
                    <p className="text-xs px-4 py-2.5" style={{ color: "#999", background: "#FAFAFA", borderTop: "1px solid #E8E8E8" }}>
                      {module.sections[currentSection].screenshotPlaceholder}
                    </p>
                  </div>
                ) : module.sections[currentSection].screenshotPlaceholder ? (
                  <div className="mt-8 mb-8 rounded-xl p-10 text-center" style={{ border: "2px dashed #E0E0E0", background: "#FDFDFD" }}>
                    <Image className="h-8 w-8 mx-auto mb-3" style={{ color: "#DDD" }} />
                    <p className="text-xs" style={{ color: "#BBB" }}>{module.sections[currentSection].screenshotPlaceholder}</p>
                  </div>
                ) : null}
                {module.sections[currentSection].videoPlaceholder && (
                  <div className="mt-6 mb-8 rounded-xl p-10 text-center" style={{ border: "2px dashed #E0E0E0", background: "#FDFDFD" }}>
                    <Video className="h-8 w-8 mx-auto mb-3" style={{ color: "#DDD" }} />
                    <p className="text-xs" style={{ color: "#BBB" }}>{module.sections[currentSection].videoPlaceholder}</p>
                  </div>
                )}

                {/* Section nav */}
                <div className="flex items-center justify-between py-6 mt-4" style={{ borderTop: "1px solid #E8E8E8" }}>
                  <button
                    onClick={() => setCurrentSection((s) => s - 1)}
                    disabled={currentSection === 0}
                    className="flex items-center gap-2 text-sm font-medium transition-opacity disabled:opacity-20"
                    style={{ color: "#111" }}
                  >
                    <ArrowLeft className="h-4 w-4" /> Previous
                  </button>
                  {currentSection < module.sections.length - 1 ? (
                    <button
                      onClick={() => setCurrentSection((s) => s + 1)}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all hover:opacity-80"
                      style={{ background: "#111", color: "#FFF" }}
                    >
                      Next Section <ArrowRight className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      onClick={() => setShowQuiz(true)}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all hover:opacity-80"
                      style={{ background: "#111", color: "#FFF" }}
                    >
                      Take Knowledge Check <CheckCircle2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Ask question */}
                <div className="mt-12 p-6 rounded-xl" style={{ background: "#FFF", border: "1px solid #E8E8E8" }}>
                  <div className="flex items-center gap-2 mb-4">
                    <MessageSquare className="h-4 w-4" style={{ color: "#999" }} />
                    <span className="text-xs font-semibold uppercase tracking-[0.15em]" style={{ color: "#999" }}>Ask a Question or Leave a Suggestion</span>
                  </div>
                  <div className="flex gap-4 mb-3">
                    <label className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: "#555" }}>
                      <input type="radio" name="qtype" checked={questionType === "question"} onChange={() => setQuestionType("question")} style={{ accentColor: "#111" }} />
                      Question
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: "#555" }}>
                      <input type="radio" name="qtype" checked={questionType === "suggestion"} onChange={() => setQuestionType("suggestion")} style={{ accentColor: "#111" }} />
                      Suggestion
                    </label>
                  </div>
                  <textarea
                    value={questionText}
                    onChange={(e) => setQuestionText(e.target.value)}
                    placeholder={questionType === "question" ? "Type your question here..." : "Share your suggestion..."}
                    rows={3}
                    className="w-full rounded-lg px-4 py-3 text-sm resize-none focus:outline-none"
                    style={{ background: "#FAFAFA", border: "1px solid #E8E8E8", color: "#333" }}
                  />
                  <button
                    onClick={handleSubmitQuestion}
                    disabled={!questionText.trim()}
                    className="mt-3 flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all disabled:opacity-30"
                    style={{ background: "#111", color: "#FFF" }}
                  >
                    <Send className="h-3 w-3" /> Submit
                  </button>
                </div>
              </>
            ) : (
              /* Quiz */
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] mb-3" style={{ color: "#999", fontWeight: 600 }}>Knowledge Check</p>
                <h2 className="text-3xl font-bold mb-2" style={{ color: "#111", fontFamily: "'Playfair Display', serif" }}>
                  Test Your Understanding
                </h2>
                <p className="text-sm mb-10" style={{ color: "#999" }}>You need 80% to pass this module.</p>

                {module.quiz.map((q, idx) => (
                  <div
                    key={q.id}
                    className="mb-6 p-5 rounded-xl"
                    style={{
                      background: "#FFF",
                      border: quizSubmitted
                        ? quizAnswers[q.id] === q.correctIndex ? "1px solid #C8E6C9" : "1px solid #FFCDD2"
                        : "1px solid #E8E8E8",
                    }}
                  >
                    <p className="font-medium text-sm mb-4" style={{ color: "#111" }}>
                      {idx + 1}. {q.question}
                    </p>
                    <RadioGroup
                      value={quizAnswers[q.id]?.toString()}
                      onValueChange={(val) => !quizSubmitted && setQuizAnswers((prev) => ({ ...prev, [q.id]: parseInt(val) }))}
                      disabled={quizSubmitted}
                    >
                      {q.options.map((opt, optIdx) => (
                        <div
                          key={optIdx}
                          className="flex items-center space-x-3 p-2.5 rounded-lg mb-1"
                          style={{
                            background: quizSubmitted && optIdx === q.correctIndex ? "#F1F8E9" : quizSubmitted && quizAnswers[q.id] === optIdx && optIdx !== q.correctIndex ? "#FFF3F3" : "transparent",
                          }}
                        >
                          <RadioGroupItem value={optIdx.toString()} id={`${q.id}-${optIdx}`} />
                          <Label htmlFor={`${q.id}-${optIdx}`} className="cursor-pointer flex-1 text-sm" style={{ color: "#333" }}>{opt}</Label>
                          {quizSubmitted && optIdx === q.correctIndex && <CheckCircle2 className="h-4 w-4" style={{ color: "#4CAF50" }} />}
                          {quizSubmitted && quizAnswers[q.id] === optIdx && optIdx !== q.correctIndex && <XCircle className="h-4 w-4" style={{ color: "#E53935" }} />}
                        </div>
                      ))}
                    </RadioGroup>
                    {quizSubmitted && (
                      <p className="text-xs mt-3 p-3 rounded-lg italic" style={{ color: "#666", background: "#FAFAFA" }}>{q.explanation}</p>
                    )}
                  </div>
                ))}

                <div className="flex items-center gap-4 mt-8">
                  {!quizSubmitted ? (
                    <>
                      <button onClick={() => setShowQuiz(false)} className="text-sm font-medium flex items-center gap-1.5" style={{ color: "#999" }}>
                        <ArrowLeft className="h-4 w-4" /> Back to Content
                      </button>
                      <button
                        onClick={handleQuizSubmit}
                        disabled={Object.keys(quizAnswers).length < module.quiz.length}
                        className="px-5 py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-30"
                        style={{ background: "#111", color: "#FFF" }}
                      >
                        Submit Answers
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="text-xl font-bold" style={{ color: quizScore >= 80 ? "#2E7D32" : "#C62828", fontFamily: "'Playfair Display', serif" }}>
                        {quizScore}%
                      </div>
                      {quizScore >= 80 ? (
                        currentModuleIdx < modules.length - 1 ? (
                          <button
                            onClick={() => navigate(`/training/${trainingPath}/${modules[currentModuleIdx + 1].id}`)}
                            className="px-5 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2"
                            style={{ background: "#111", color: "#FFF" }}
                          >
                            Next Module <ArrowRight className="h-4 w-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() => navigate("/training")}
                            className="px-5 py-2.5 rounded-lg text-sm font-medium"
                            style={{ background: "#111", color: "#FFF" }}
                          >
                            🎉 Training Complete
                          </button>
                        )
                      ) : (
                        <button onClick={handleRetryQuiz} className="text-sm font-medium" style={{ color: "#111", textDecoration: "underline" }}>
                          Retry Quiz
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: AI Assistant */}
        <div className="hidden lg:flex w-[380px] flex-col flex-shrink-0" style={{ borderLeft: "1px solid #E8E8E8", background: "#FFF" }}>
          <div className="p-5" style={{ borderBottom: "1px solid #E8E8E8" }}>
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "#111" }}>
                <Bot className="h-3.5 w-3.5" style={{ color: "#FFF" }} />
              </div>
              <div>
                <h3 className="text-sm font-semibold" style={{ color: "#111" }}>AI Assistant</h3>
                <p className="text-[11px]" style={{ color: "#BBB" }}>Ask about this module</p>
              </div>
            </div>
          </div>

          <ScrollArea className="flex-1 p-5">
            {chatMessages.length === 0 && (
              <div className="py-8">
                <p className="text-xs mb-6" style={{ color: "#BBB", lineHeight: 1.7 }}>
                  I can help explain accounting concepts, LakeCity processes, or anything in this module.
                </p>
                <div className="space-y-2">
                  {["What is segregation of duties?", "Explain the payment recording flow", "How does the audit trail work?"].map((q) => (
                    <button
                      key={q}
                      onClick={() => setChatInput(q)}
                      className="w-full text-left text-xs px-3 py-2.5 rounded-lg transition-colors hover:bg-gray-50 flex items-center gap-2"
                      style={{ color: "#666", border: "1px solid #E8E8E8" }}
                    >
                      <Lightbulb className="h-3 w-3 flex-shrink-0" style={{ color: "#CCC" }} /> {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {chatMessages.map((msg, idx) => (
              <div key={idx} className={`flex gap-2.5 mb-4 ${msg.role === "user" ? "justify-end" : ""}`}>
                {msg.role === "assistant" && (
                  <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: "#111" }}>
                    <Bot className="h-3 w-3" style={{ color: "#FFF" }} />
                  </div>
                )}
                <div
                  className="rounded-xl px-3.5 py-2.5 max-w-[85%] text-sm"
                  style={{
                    background: msg.role === "user" ? "#111" : "#F5F5F5",
                    color: msg.role === "user" ? "#FFF" : "#333",
                    lineHeight: 1.6,
                  }}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex gap-2.5 mb-4">
                <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#111" }}>
                  <Bot className="h-3 w-3" style={{ color: "#FFF" }} />
                </div>
                <div className="rounded-xl px-3.5 py-2.5 text-sm animate-pulse" style={{ background: "#F5F5F5", color: "#BBB" }}>
                  Thinking...
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </ScrollArea>

          <div className="p-4" style={{ borderTop: "1px solid #E8E8E8" }}>
            <div className="flex gap-2">
              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask a question..."
                rows={2}
                className="flex-1 rounded-lg px-3.5 py-2.5 text-sm resize-none focus:outline-none"
                style={{ background: "#FAFAFA", border: "1px solid #E8E8E8", color: "#333" }}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendChat(); } }}
              />
              <button
                onClick={handleSendChat}
                disabled={!chatInput.trim() || chatLoading}
                className="self-end p-2.5 rounded-lg transition-all disabled:opacity-30"
                style={{ background: "#111", color: "#FFF" }}
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrainingModule;
