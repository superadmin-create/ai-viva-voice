import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, TrendingUp, Users, BookOpen, CheckCircle2, Plus, Trash2, Edit2, ExternalLink, LogOut, Shield, UserPlus, Key, Copy } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

type VivaResult = {
  id: number;
  studentName: string;
  studentEmail: string;
  studentPhone: string;
  subject: string;
  score: number;
  maxScore: number;
  transcript: Array<{
    question: string;
    answer: string;
    feedback: string;
    score: number;
  }>;
  timestamp: string;
  status: string;
  sheetSynced: string | null;
};

type Subject = {
  id?: number;
  name: string;
  slug: string;
  isBuiltIn: boolean;
  createdBy?: string | null;
};

type ManualQuestion = {
  id: number;
  subjectSlug: string;
  questionText: string;
  createdAt: string;
};

type AdminUser = {
  id: string;
  username: string;
  role: string;
};

type AdminPanelProps = {
  user: AdminUser;
  onLogout: () => void;
};

export default function AdminPanel({ user, onLogout }: AdminPanelProps) {
  const queryClient = useQueryClient();
  const [selectedResult, setSelectedResult] = useState<VivaResult | null>(null);
  const [showSubjectDialog, setShowSubjectDialog] = useState(false);
  const [showQuestionDialog, setShowQuestionDialog] = useState(false);
  const [showUserDialog, setShowUserDialog] = useState(false);
  const [showResetPasswordDialog, setShowResetPasswordDialog] = useState<string | null>(null);
  const [selectedSubjectSlug, setSelectedSubjectSlug] = useState<string | null>(null);
  const [newSubject, setNewSubject] = useState({ name: "", slug: "", curriculum: "" });
  const [newQuestion, setNewQuestion] = useState("");
  const [newUser, setNewUser] = useState({ username: "", password: "", role: "admin" });
  const [resetPassword, setResetPassword] = useState("");

  const { data: results, isLoading } = useQuery<VivaResult[]>({
    queryKey: ["admin-results"],
    queryFn: async () => {
      const response = await fetch("/api/admin/results");
      if (!response.ok) throw new Error("Failed to fetch results");
      return response.json();
    },
  });

  const { data: allSubjects } = useQuery<Subject[]>({
    queryKey: ["subjects"],
    queryFn: async () => {
      const response = await fetch("/api/subjects");
      if (!response.ok) throw new Error("Failed to fetch subjects");
      return response.json();
    },
  });

  const isAdmin = user.role === "admin";
  const subjects = isAdmin
    ? allSubjects
    : allSubjects?.filter(s => s.createdBy === user.id || s.isBuiltIn);

  const { data: questions } = useQuery<ManualQuestion[]>({
    queryKey: ["questions", selectedSubjectSlug],
    queryFn: async () => {
      if (!selectedSubjectSlug) return [];
      const response = await fetch(`/api/admin/subjects/${selectedSubjectSlug}/questions`);
      if (!response.ok) throw new Error("Failed to fetch questions");
      return response.json();
    },
    enabled: !!selectedSubjectSlug,
  });

  const createSubjectMutation = useMutation({
    mutationFn: async (data: { name: string; slug: string; curriculum: any[] }) => {
      const response = await fetch("/api/admin/subjects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to create subject");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subjects"] });
      toast.success("Subject created successfully!");
      setShowSubjectDialog(false);
      setNewSubject({ name: "", slug: "", curriculum: "" });
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const deleteSubjectMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/admin/subjects/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Failed to delete subject");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subjects"] });
      toast.success("Subject deleted!");
    },
  });

  const createQuestionMutation = useMutation({
    mutationFn: async (data: { subjectSlug: string; questionText: string }) => {
      const response = await fetch("/api/admin/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to create question");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["questions", selectedSubjectSlug] });
      toast.success("Question added!");
      setNewQuestion("");
      setShowQuestionDialog(false);
    },
  });

  const deleteQuestionMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/admin/questions/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Failed to delete question");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["questions", selectedSubjectSlug] });
      toast.success("Question deleted!");
    },
  });

  const { data: adminUsers } = useQuery<AdminUser[]>({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const response = await fetch("/api/admin/users");
      if (!response.ok) throw new Error("Failed to fetch users");
      return response.json();
    },
    enabled: user.role === "admin",
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: { username: string; password: string; role: string }) => {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to create user");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("User created successfully!");
      setShowUserDialog(false);
      setNewUser({ username: "", password: "", role: "admin" });
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to delete user");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("User deleted!");
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ id, password }: { id: string; password: string }) => {
      const response = await fetch(`/api/admin/users/${id}/password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) throw new Error("Failed to reset password");
      return response.json();
    },
    onSuccess: () => {
      toast.success("Password reset successfully!");
      setShowResetPasswordDialog(null);
      setResetPassword("");
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const handleCreateSubject = () => {
    try {
      const curriculum = newSubject.curriculum.trim() 
        ? JSON.parse(newSubject.curriculum) 
        : [{ title: "General Topics", topics: ["Introduction"] }];
      
      createSubjectMutation.mutate({
        name: newSubject.name,
        slug: newSubject.slug.toLowerCase().replace(/\s+/g, '-'),
        curriculum,
      });
    } catch (e) {
      toast.error("Invalid curriculum JSON format");
    }
  };

  const stats = {
    total: results?.length || 0,
    avgScore: results && results.length > 0
      ? (results.reduce((acc, r) => acc + (r.score / r.maxScore) * 100, 0) / results.length).toFixed(1)
      : "0.0",
    subjects: subjects?.length || 0,
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-violet-50/30 to-slate-50">
      <div className="container mx-auto p-6 max-w-7xl">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-5xl font-bold mb-2 bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent" data-testid="heading-admin">
              {isAdmin ? "Admin Dashboard" : "Dashboard"}
            </h1>
            <p className="text-muted-foreground text-lg">
              {isAdmin ? "Monitor and manage mock viva examinations" : "Manage your subjects and view examination results"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Results are automatically saved to Google Sheet: <strong>AI Viva Results</strong>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium" data-testid="text-username">{user.username}</p>
              <Badge variant="secondary" className="text-xs">
                <Shield className="h-3 w-3 mr-1" />
                {user.role}
              </Badge>
            </div>
            <Button variant="outline" size="sm" onClick={onLogout} data-testid="button-logout">
              <LogOut className="h-4 w-4 mr-1" />
              Sign Out
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="border-2 hover:border-violet-200 transition-all" data-testid="card-total-exams">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Examinations</CardTitle>
              <Users className="h-5 w-5 text-violet-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold" data-testid="text-total-count">{stats.total}</div>
            </CardContent>
          </Card>

          <Card className="border-2 hover:border-violet-200 transition-all" data-testid="card-avg-score">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Average Score</CardTitle>
              <TrendingUp className="h-5 w-5 text-violet-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold" data-testid="text-avg-score">{stats.avgScore}%</div>
            </CardContent>
          </Card>

          <Card className="border-2 hover:border-violet-200 transition-all" data-testid="card-subjects">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Subjects</CardTitle>
              <BookOpen className="h-5 w-5 text-violet-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold" data-testid="text-subject-count">{stats.subjects}</div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="results" className="space-y-6">
          <TabsList>
            <TabsTrigger value="results">Examination Results</TabsTrigger>
            <TabsTrigger value="subjects">Manage Subjects</TabsTrigger>
            <TabsTrigger value="questions">Manage Questions</TabsTrigger>
            {user.role === "admin" && (
              <TabsTrigger value="users">Manage Users</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="results">
            <Card className="border-2" data-testid="card-results-table">
              <CardHeader>
                <CardTitle>Examination Results</CardTitle>
                <CardDescription>All mock viva examination records</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center py-12" data-testid="loading-results">
                    <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
                  </div>
                ) : results && results.length > 0 ? (
                  <ScrollArea className="h-[500px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Student</TableHead>
                          <TableHead>Subject</TableHead>
                          <TableHead>Score</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {results.map((result) => (
                          <TableRow
                            key={result.id}
                            className="cursor-pointer hover:bg-violet-50"
                            onClick={() => setSelectedResult(result)}
                            data-testid={`row-result-${result.id}`}
                          >
                            <TableCell>
                              <div>
                                <div className="font-medium">{result.studentName}</div>
                                <div className="text-sm text-muted-foreground">{result.studentEmail}</div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="capitalize">
                                {result.subject}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="font-semibold text-lg">
                                {result.score}/{result.maxScore}
                              </div>
                            </TableCell>
                            <TableCell>
                              {new Date(result.timestamp).toLocaleDateString()}
                            </TableCell>
                            <TableCell>
                              <Badge variant="default" className="bg-green-600">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Completed
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <button className="text-violet-600 hover:text-violet-800 text-sm font-medium">
                                View Details
                              </button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    No examination results yet
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="subjects">
            <Card className="border-2">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Manage Subjects</CardTitle>
                  <CardDescription>Add or remove examination subjects</CardDescription>
                </div>
                <Button onClick={() => setShowSubjectDialog(true)} data-testid="button-add-subject">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Subject
                </Button>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {subjects?.map((subject) => (
                    <div key={subject.slug} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-4">
                        <div>
                          <p className="font-medium">{subject.name}</p>
                          <p className="text-sm text-muted-foreground">/{subject.slug}</p>
                        </div>
                        {subject.isBuiltIn && (
                          <Badge variant="secondary">Built-in</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(`/${subject.slug}`, '_blank')}
                        >
                          <ExternalLink className="h-4 w-4 mr-1" />
                          Open
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            navigator.clipboard.writeText(`${window.location.origin}/${subject.slug}`);
                            toast.success("Link copied to clipboard!");
                          }}
                          data-testid={`button-copy-link-${subject.slug}`}
                        >
                          <Copy className="h-4 w-4 mr-1" />
                          Copy Link
                        </Button>
                        {!subject.isBuiltIn && subject.id && (isAdmin || subject.createdBy === user.id) && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => deleteSubjectMutation.mutate(subject.id!)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="questions">
            <Card className="border-2">
              <CardHeader>
                <CardTitle>Manage Questions</CardTitle>
                <CardDescription>Add manual questions for subjects (AI will use these first)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label>Select Subject</Label>
                  <select
                    className="w-full mt-2 p-2 border rounded-lg"
                    value={selectedSubjectSlug || ""}
                    onChange={(e) => setSelectedSubjectSlug(e.target.value || null)}
                    data-testid="select-subject"
                  >
                    <option value="">Choose a subject...</option>
                    {subjects?.filter(s => isAdmin || s.createdBy === user.id).map((s) => (
                      <option key={s.slug} value={s.slug}>{s.name}</option>
                    ))}
                  </select>
                </div>

                {selectedSubjectSlug && (
                  <>
                    <div className="flex justify-between items-center">
                      <h3 className="font-medium">Questions for {subjects?.find(s => s.slug === selectedSubjectSlug)?.name}</h3>
                      <Button onClick={() => setShowQuestionDialog(true)} size="sm" data-testid="button-add-question">
                        <Plus className="h-4 w-4 mr-1" />
                        Add Question
                      </Button>
                    </div>

                    <div className="space-y-2">
                      {questions && questions.length > 0 ? (
                        questions.map((q) => (
                          <div key={q.id} className="flex items-center justify-between p-3 border rounded-lg">
                            <p className="flex-1">{q.questionText}</p>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteQuestionMutation.mutate(q.id)}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        ))
                      ) : (
                        <p className="text-muted-foreground text-center py-8">
                          No manual questions yet. AI will generate all questions.
                        </p>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {user.role === "admin" && (
            <TabsContent value="users">
              <Card className="border-2">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Manage Users</CardTitle>
                    <CardDescription>Create and manage admin users</CardDescription>
                  </div>
                  <Button onClick={() => setShowUserDialog(true)} data-testid="button-add-user">
                    <UserPlus className="h-4 w-4 mr-2" />
                    Add User
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {adminUsers?.map((u) => (
                      <div key={u.id} className="flex items-center justify-between p-4 border rounded-lg" data-testid={`row-user-${u.id}`}>
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-violet-100 rounded-full flex items-center justify-center">
                            <Users className="h-5 w-5 text-violet-600" />
                          </div>
                          <div>
                            <p className="font-medium">{u.username}</p>
                            <Badge variant="secondary" className="text-xs mt-1">
                              <Shield className="h-3 w-3 mr-1" />
                              {u.role}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setShowResetPasswordDialog(u.id);
                              setResetPassword("");
                            }}
                            data-testid={`button-reset-password-${u.id}`}
                          >
                            <Key className="h-4 w-4 mr-1" />
                            Reset Password
                          </Button>
                          {u.id !== user.id && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => deleteUserMutation.mutate(u.id)}
                              data-testid={`button-delete-user-${u.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                    {(!adminUsers || adminUsers.length === 0) && (
                      <p className="text-muted-foreground text-center py-8">No users found</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>

      {/* Result Details Dialog */}
      <Dialog open={!!selectedResult} onOpenChange={() => setSelectedResult(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Examination Details</DialogTitle>
            <DialogDescription>Full transcript and evaluation</DialogDescription>
          </DialogHeader>
          {selectedResult && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Student Name</p>
                  <p className="font-medium">{selectedResult.studentName}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-medium">{selectedResult.studentEmail}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Phone</p>
                  <p className="font-medium">{selectedResult.studentPhone}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Subject</p>
                  <p className="font-medium capitalize">{selectedResult.subject}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Final Score</p>
                  <p className="text-2xl font-bold text-violet-600">
                    {selectedResult.score}/{selectedResult.maxScore}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Date</p>
                  <p className="font-medium">{new Date(selectedResult.timestamp).toLocaleString()}</p>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-4">Transcript</h3>
                <div className="space-y-4">
                  {selectedResult.transcript.map((item, index) => (
                    <Card key={index}>
                      <CardContent className="pt-6 space-y-3">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Question {index + 1}</p>
                          <p className="font-medium">{item.question}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Student Answer</p>
                          <p>{item.answer}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Feedback</p>
                          <p className="text-sm">{item.feedback}</p>
                        </div>
                        <Badge variant={item.score >= 7 ? "default" : item.score >= 5 ? "secondary" : "destructive"}>
                          Score: {item.score}/10
                        </Badge>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Subject Dialog */}
      <Dialog open={showSubjectDialog} onOpenChange={setShowSubjectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Subject</DialogTitle>
            <DialogDescription>Create a new examination subject with curriculum content</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Subject Name</Label>
              <Input
                placeholder="e.g., Introduction to Python"
                value={newSubject.name}
                onChange={(e) => setNewSubject({ ...newSubject, name: e.target.value })}
                data-testid="input-subject-name"
              />
            </div>
            <div>
              <Label>URL Slug</Label>
              <Input
                placeholder="e.g., python"
                value={newSubject.slug}
                onChange={(e) => setNewSubject({ ...newSubject, slug: e.target.value })}
                data-testid="input-subject-slug"
              />
              <p className="text-xs text-muted-foreground mt-1">Students will access via /{newSubject.slug || 'slug'}</p>
            </div>
            <div>
              <Label>Curriculum (JSON)</Label>
              <Textarea
                placeholder='[{"title": "Module 1", "topics": ["Topic 1", "Topic 2"]}]'
                value={newSubject.curriculum}
                onChange={(e) => setNewSubject({ ...newSubject, curriculum: e.target.value })}
                className="min-h-[150px] font-mono text-sm"
                data-testid="input-curriculum"
              />
              <p className="text-xs text-muted-foreground mt-1">Leave empty for default curriculum</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSubjectDialog(false)}>Cancel</Button>
            <Button onClick={handleCreateSubject} disabled={!newSubject.name || !newSubject.slug}>
              Create Subject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Question Dialog */}
      <Dialog open={showQuestionDialog} onOpenChange={setShowQuestionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Manual Question</DialogTitle>
            <DialogDescription>This question will be used instead of AI-generated ones</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Question Text</Label>
              <Textarea
                placeholder="Enter your question..."
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                className="min-h-[100px]"
                data-testid="input-question-text"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowQuestionDialog(false)}>Cancel</Button>
            <Button 
              onClick={() => selectedSubjectSlug && createQuestionMutation.mutate({ 
                subjectSlug: selectedSubjectSlug, 
                questionText: newQuestion 
              })}
              disabled={!newQuestion.trim()}
            >
              Add Question
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add User Dialog */}
      <Dialog open={showUserDialog} onOpenChange={setShowUserDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
            <DialogDescription>Create a new admin user account</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Username</Label>
              <Input
                placeholder="Enter username"
                value={newUser.username}
                onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                data-testid="input-new-username"
              />
            </div>
            <div>
              <Label>Password</Label>
              <Input
                type="password"
                placeholder="Enter password"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                data-testid="input-new-password"
              />
            </div>
            <div>
              <Label>Role</Label>
              <select
                className="w-full mt-2 p-2 border rounded-lg"
                value={newUser.role}
                onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                data-testid="select-user-role"
              >
                <option value="admin">Admin</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUserDialog(false)}>Cancel</Button>
            <Button
              onClick={() => createUserMutation.mutate(newUser)}
              disabled={!newUser.username.trim() || !newUser.password.trim()}
              data-testid="button-create-user"
            >
              Create User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={!!showResetPasswordDialog} onOpenChange={() => setShowResetPasswordDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>Set a new password for this user</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>New Password</Label>
              <Input
                type="password"
                placeholder="Enter new password"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                data-testid="input-reset-password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetPasswordDialog(null)}>Cancel</Button>
            <Button
              onClick={() => showResetPasswordDialog && resetPasswordMutation.mutate({ id: showResetPasswordDialog, password: resetPassword })}
              disabled={!resetPassword.trim()}
              data-testid="button-confirm-reset"
            >
              Reset Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
