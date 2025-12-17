import { useState, useEffect, useRef } from "react";
import { useRoute } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Loader2, Mic, MicOff, Volume2, CheckCircle2, User, Mail, Phone } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

type Question = {
  text: string;
  answer: string;
  feedback: string;
  score: number;
};

export default function VivaPage() {
  const [, params] = useRoute("/:subject");
  const subject = params?.subject || "";

  const [step, setStep] = useState<"register" | "exam" | "completed">("register");
  const [studentInfo, setStudentInfo] = useState({ name: "", email: "", phone: "" });
  
  const [questions, setQuestions] = useState<string[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [transcript, setTranscript] = useState<Question[]>([]);
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const generateQuestionsMutation = useMutation({
    mutationFn: async (subject: string) => {
      const response = await fetch("/api/viva/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, count: 5 }),
      });
      if (!response.ok) throw new Error("Failed to generate questions");
      return response.json();
    },
  });

  const evaluateAnswerMutation = useMutation({
    mutationFn: async ({ question, answer }: { question: string; answer: string }) => {
      const response = await fetch("/api/viva/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, answer, subject }),
      });
      if (!response.ok) throw new Error("Failed to evaluate answer");
      return response.json();
    },
  });

  const submitResultsMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch("/api/viva/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to submit results");
      return response.json();
    },
  });

  useEffect(() => {
    if ('webkitSpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;

      recognitionRef.current.onresult = (event: any) => {
        const text = event.results[0][0].transcript;
        setCurrentAnswer(text);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, []);

  const startListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  const speakQuestion = async (text: string) => {
    setIsSpeaking(true);
    try {
      const response = await fetch("/api/viva/text-to-speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) throw new Error("Failed to generate speech");

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      
      if (audioRef.current) {
        audioRef.current.src = audioUrl;
        audioRef.current.play();
        audioRef.current.onended = () => {
          setIsSpeaking(false);
          URL.revokeObjectURL(audioUrl);
        };
      }
    } catch (error) {
      console.error("TTS error:", error);
      setIsSpeaking(false);
    }
  };

  const startExam = async () => {
    if (!studentInfo.name || !studentInfo.email || !studentInfo.phone) {
      toast.error("Please fill in all fields");
      return;
    }

    setStep("exam");
    const result = await generateQuestionsMutation.mutateAsync(subject);
    setQuestions(result.questions);
    
    if (result.questions.length > 0) {
      await speakQuestion(result.questions[0]);
    }
  };

  const submitAnswer = async () => {
    if (!currentAnswer.trim()) {
      toast.error("Please provide an answer");
      return;
    }

    setIsProcessing(true);

    const evaluation = await evaluateAnswerMutation.mutateAsync({
      question: questions[currentQuestionIndex],
      answer: currentAnswer,
    });

    setTranscript([...transcript, {
      text: questions[currentQuestionIndex],
      answer: currentAnswer,
      feedback: evaluation.feedback,
      score: evaluation.score,
    }]);

    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setCurrentAnswer("");
      setIsProcessing(false);
      await speakQuestion(questions[currentQuestionIndex + 1]);
    } else {
      const totalScore = [...transcript, {
        text: questions[currentQuestionIndex],
        answer: currentAnswer,
        feedback: evaluation.feedback,
        score: evaluation.score,
      }].reduce((sum, t) => sum + t.score, 0);

      await submitResultsMutation.mutateAsync({
        studentName: studentInfo.name,
        studentEmail: studentInfo.email,
        studentPhone: studentInfo.phone,
        subject,
        score: totalScore,
        maxScore: questions.length * 10,
        transcript: [...transcript, {
          question: questions[currentQuestionIndex],
          answer: currentAnswer,
          feedback: evaluation.feedback,
          score: evaluation.score,
        }],
        status: "completed",
        sheetSynced: "pending",
      });

      setStep("completed");
      setIsProcessing(false);
    }
  };

  if (step === "register") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-violet-50/30 to-slate-50 flex items-center justify-center p-6">
        <Card className="w-full max-w-lg border-2 shadow-2xl" data-testid="card-registration">
          <CardHeader className="text-center">
            <CardTitle className="text-4xl font-bold bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent" data-testid="heading-viva-title">
              AI Viva Voce
            </CardTitle>
            <CardDescription className="text-lg">
              <Badge variant="outline" className="text-lg px-4 py-1 capitalize" data-testid="badge-subject">
                {subject}
              </Badge>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Full Name
                </Label>
                <Input
                  id="name"
                  placeholder="Enter your full name"
                  value={studentInfo.name}
                  onChange={(e) => setStudentInfo({ ...studentInfo, name: e.target.value })}
                  data-testid="input-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  value={studentInfo.email}
                  onChange={(e) => setStudentInfo({ ...studentInfo, email: e.target.value })}
                  data-testid="input-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone" className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  Phone Number
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="Enter your phone number"
                  value={studentInfo.phone}
                  onChange={(e) => setStudentInfo({ ...studentInfo, phone: e.target.value })}
                  data-testid="input-phone"
                />
              </div>
            </div>
            <Button
              onClick={startExam}
              className="w-full h-12 text-lg bg-violet-600 hover:bg-violet-700"
              disabled={generateQuestionsMutation.isPending}
              data-testid="button-start-exam"
            >
              {generateQuestionsMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Preparing Exam...
                </>
              ) : (
                "Start Examination"
              )}
            </Button>
          </CardContent>
        </Card>
        <audio ref={audioRef} hidden />
      </div>
    );
  }

  if (step === "exam") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-violet-50/30 to-slate-50 p-6">
        <div className="container mx-auto max-w-4xl">
          <div className="mb-6">
            <Progress value={((currentQuestionIndex + 1) / questions.length) * 100} className="h-2" data-testid="progress-exam" />
            <p className="text-center mt-2 text-sm text-muted-foreground" data-testid="text-question-progress">
              Question {currentQuestionIndex + 1} of {questions.length}
            </p>
          </div>

          <Card className="border-2 shadow-2xl" data-testid="card-question">
            <CardHeader>
              <CardTitle className="text-2xl flex items-center gap-3">
                <Volume2 className={isSpeaking ? "animate-pulse text-violet-600" : "text-muted-foreground"} />
                <span data-testid="text-current-question">{questions[currentQuestionIndex]}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label htmlFor="answer">Your Answer</Label>
                <div className="relative mt-2">
                  <Input
                    id="answer"
                    value={currentAnswer}
                    onChange={(e) => setCurrentAnswer(e.target.value)}
                    placeholder="Type or speak your answer..."
                    className="pr-12"
                    data-testid="input-answer"
                  />
                  <Button
                    size="icon"
                    variant={isListening ? "default" : "outline"}
                    className="absolute right-1 top-1/2 -translate-y-1/2"
                    onClick={isListening ? stopListening : startListening}
                    data-testid="button-voice"
                  >
                    {isListening ? <Mic className="h-4 w-4 animate-pulse" /> : <MicOff className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <Button
                onClick={submitAnswer}
                disabled={isProcessing || !currentAnswer.trim()}
                className="w-full h-12 text-lg bg-violet-600 hover:bg-violet-700"
                data-testid="button-submit-answer"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Evaluating...
                  </>
                ) : currentQuestionIndex < questions.length - 1 ? (
                  "Next Question"
                ) : (
                  "Submit Examination"
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
        <audio ref={audioRef} hidden />
      </div>
    );
  }

  if (step === "completed") {
    const totalScore = transcript.reduce((sum, t) => sum + t.score, 0);
    const maxScore = questions.length * 10;
    const percentage = (totalScore / maxScore) * 100;

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-violet-50/30 to-slate-50 flex items-center justify-center p-6">
        <Card className="w-full max-w-2xl border-2 shadow-2xl" data-testid="card-completion">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
            <CardTitle className="text-4xl font-bold" data-testid="heading-complete">
              Examination Complete!
            </CardTitle>
            <CardDescription className="text-lg mt-2">
              Thank you for participating
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 text-center">
            <div className="bg-violet-50 rounded-lg p-6">
              <p className="text-muted-foreground mb-2">Your examination has been submitted</p>
              <p className="text-sm text-muted-foreground">
                Results will be reviewed by the administrator and saved to the records.
              </p>
            </div>

            <div className="pt-4">
              <Button
                onClick={() => window.location.href = "/"}
                className="bg-violet-600 hover:bg-violet-700"
                data-testid="button-home"
              >
                Return to Home
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
}
