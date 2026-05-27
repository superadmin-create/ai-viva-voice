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
import { Loader2, TrendingUp, Users, BookOpen, CheckCircle2, XCircle, Plus, Trash2, Edit2, ExternalLink, LogOut, Shield, UserPlus, Key, Copy, Upload, FileText, Filter, X, Download, Clock, Search } from "lucide-react";
import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

type DimensionScores = {
  contentAccuracy: number;
  confidence: number;
  clarity: number;
  salesEffectiveness: number;
};

type VivaResult = {
  id: number;
  studentName: string;
  studentEmail: string;
  studentPhone: string;
  studentClass: string;
  studentDivision: string;
  studentRollNumber: string;
  subject: string;
  score: number;
  maxScore: number;
  transcript: Array<{
    question: string;
    answer: string;
    feedback: string;
    score: number;
    dimensionScores?: DimensionScores;
  }>;
  timestamp: string;
  status: string;
  sheetSynced: string | null;
  studentPhoto: string | null;
};

type Subject = {
  id?: number;
  name: string;
  slug: string;
  isBuiltIn: boolean;
  subjectType?: string;
  curriculum?: any;
  instructions?: string | null;
  allowedEmails?: string[] | null;
  isActive?: boolean;
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
  const [newSubject, setNewSubject] = useState({ name: "", curriculum: "", instructions: "", allowedEmails: "", subjectType: "academic" });
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [editSubjectData, setEditSubjectData] = useState({ name: "", curriculum: "", instructions: "", allowedEmails: "", subjectType: "academic" });
  const [newQuestion, setNewQuestion] = useState("");
  const [newUser, setNewUser] = useState({ username: "", password: "", role: "admin" });
  const [resetPassword, setResetPassword] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [filterClass, setFilterClass] = useState("");
  const [filterDivision, setFilterDivision] = useState("");
  const [filterSubject, setFilterSubject] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [filterUser, setFilterUser] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [filterStatus, setFilterStatus] = useState("");
  const [sortField, setSortField] = useState("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const { data: results, isLoading } = useQuery<VivaResult[]>({
    queryKey: ["admin-results"],
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.some(r => r.status === "evaluating") ? 5000 : false;
    },
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

  const { data: documents } = useQuery<Array<{ id: number; fileName: string; fileType: string; subjectSlug: string; createdAt: string; textLength: number }>>({
    queryKey: ["documents", selectedSubjectSlug],
    queryFn: async () => {
      if (!selectedSubjectSlug) return [];
      const response = await fetch(`/api/admin/documents/${selectedSubjectSlug}`);
      if (!response.ok) throw new Error("Failed to fetch documents");
      return response.json();
    },
    enabled: !!selectedSubjectSlug,
  });

  const uploadDocumentMutation = useMutation({
    mutationFn: async (data: { subjectSlug: string; file: File }) => {
      const formData = new FormData();
      formData.append('file', data.file);
      formData.append('subjectSlug', data.subjectSlug);
      const response = await fetch("/api/admin/documents", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to upload document");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", selectedSubjectSlug] });
      toast.success("Document uploaded and processed!");
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const deleteDocumentMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/admin/documents/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Failed to delete document");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", selectedSubjectSlug] });
      toast.success("Document deleted!");
    },
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
      setNewSubject({ name: "", curriculum: "", instructions: "", allowedEmails: "", subjectType: "academic" });
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

  const bulkCreateQuestionsMutation = useMutation({
    mutationFn: async (data: { subjectSlug: string; questions: string[] }) => {
      const response = await fetch("/api/admin/questions/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to create questions");
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["questions", selectedSubjectSlug] });
      toast.success(`${data.count} questions added!`);
      setNewQuestion("");
      setShowQuestionDialog(false);
    },
    onError: (error: any) => {
      toast.error(error.message);
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

  const [editingQuestionId, setEditingQuestionId] = useState<number | null>(null);
  const [editingQuestionText, setEditingQuestionText] = useState("");

  const updateQuestionMutation = useMutation({
    mutationFn: async ({ id, questionText }: { id: number; questionText: string }) => {
      const response = await fetch(`/api/admin/questions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionText }),
      });
      if (!response.ok) throw new Error("Failed to update question");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["questions", selectedSubjectSlug] });
      toast.success("Question updated!");
      setEditingQuestionId(null);
      setEditingQuestionText("");
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

  const resetAttemptMutation = useMutation({
    mutationFn: async ({ email, subject }: { email: string; subject: string }) => {
      const response = await fetch("/api/admin/reset-attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, subject }),
      });
      if (!response.ok) throw new Error("Failed to reset attempt");
      return response.json();
    },
    onSuccess: () => {
      toast.success("Attempt reset! Student can now retake the exam.");
      queryClient.invalidateQueries({ queryKey: ["results"] });
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const toggleSubjectActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const response = await fetch(`/api/admin/subjects/${id}/toggle-active`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      if (!response.ok) throw new Error("Failed to update subject");
      return response.json();
    },
    onSuccess: (_, { isActive }) => {
      toast.success(isActive ? "Subject activated — students can access it now." : "Subject deactivated — students can no longer access it.");
      queryClient.invalidateQueries({ queryKey: ["subjects"] });
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const updateSubjectMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, any> }) => {
      const response = await fetch(`/api/admin/subjects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update subject");
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success("Subject updated successfully!");
      queryClient.invalidateQueries({ queryKey: ["subjects"] });
      setEditingSubject(null);
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const curriculumToText = (curriculum: { title: string; topics: string[] }[]): string =>
    curriculum.map(m => `${m.title}:\n${m.topics.map(t => `- ${t}`).join('\n')}`).join('\n\n');

  const openEditDialog = (subject: Subject) => {
    setEditingSubject(subject);
    setEditSubjectData({
      name: subject.name,
      curriculum: curriculumToText(subject.curriculum as { title: string; topics: string[] }[]),
      instructions: subject.instructions ?? "",
      allowedEmails: (subject.allowedEmails as string[] | null ?? []).join('\n'),
      subjectType: subject.subjectType ?? "academic",
    });
  };

  const handleUpdateSubject = () => {
    if (!editingSubject?.id) return;
    const lines = editSubjectData.curriculum.trim()
      ? editSubjectData.curriculum.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0)
      : [];
    const curriculum: { title: string; topics: string[] }[] = [];
    let currentModule: { title: string; topics: string[] } | null = null;
    if (lines.length === 0) {
      curriculum.push({ title: editSubjectData.name, topics: ["General topics"] });
    } else {
      for (const line of lines) {
        if (line.endsWith(':')) {
          if (currentModule) curriculum.push(currentModule);
          currentModule = { title: line.slice(0, -1), topics: [] };
        } else if (line.startsWith('- ') || (currentModule && !line.endsWith(':'))) {
          const topic = line.startsWith('- ') ? line.slice(2).trim() : line;
          if (currentModule) currentModule.topics.push(topic);
          else currentModule = { title: "General Topics", topics: [topic] };
        }
      }
      if (currentModule) curriculum.push(currentModule);
    }
    const parsedEmails = editSubjectData.allowedEmails
      .split(/[\n,]/)
      .map((e: string) => e.trim().toLowerCase())
      .filter((e: string) => e.includes("@"));

    updateSubjectMutation.mutate({
      id: editingSubject.id,
      data: {
        name: editSubjectData.name,
        curriculum,
        instructions: editSubjectData.instructions.trim() || null,
        allowedEmails: parsedEmails.length > 0 ? parsedEmails : [],
        subjectType: editSubjectData.subjectType,
      },
    });
  };

  const bulkResetMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const response = await fetch("/api/admin/reset-attempts-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!response.ok) throw new Error("Failed to bulk reset attempts");
      return response.json();
    },
    onSuccess: (data) => {
      toast.success(`${data.count} attempt(s) reset — students can now retake the exam.`);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["admin-results"] });
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const handleCreateSubject = () => {
    const lines = newSubject.curriculum.trim()
      ? newSubject.curriculum.split('\n').map(l => l.trim()).filter(l => l.length > 0)
      : [];

    let curriculum: Array<{ title: string; topics: string[] }> = [];

    if (lines.length === 0) {
      curriculum = [{ title: "General Topics", topics: ["Introduction"] }];
    } else {
      let currentModule: { title: string; topics: string[] } | null = null;
      for (const line of lines) {
        if (line.endsWith(':')) {
          if (currentModule) curriculum.push(currentModule);
          currentModule = { title: line.slice(0, -1).trim(), topics: [] };
        } else {
          const topic = line.startsWith('- ') ? line.slice(2).trim() : line;
          if (currentModule) {
            currentModule.topics.push(topic);
          } else {
            currentModule = { title: "General Topics", topics: [topic] };
          }
        }
      }
      if (currentModule) curriculum.push(currentModule);
    }

    const autoSlug = newSubject.name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    const parsedEmails = newSubject.allowedEmails
      .split(/[\n,]/)
      .map((e: string) => e.trim().toLowerCase())
      .filter((e: string) => e.includes("@"));

    createSubjectMutation.mutate({
      name: newSubject.name,
      slug: autoSlug,
      curriculum,
      subjectType: newSubject.subjectType,
      ...(newSubject.instructions.trim() ? { instructions: newSubject.instructions.trim() } : {}),
      ...(parsedEmails.length > 0 ? { allowedEmails: parsedEmails } : {}),
    });
  };

  const subjectOwnerMap = new Map<string, string>();
  (allSubjects || []).forEach(s => {
    if (s.createdBy) subjectOwnerMap.set(s.slug, s.createdBy);
  });

  const uniqueClasses = [...new Set((results || []).map(r => r.studentClass).filter(Boolean))].sort();
  const uniqueDivisions = [...new Set((results || []).map(r => r.studentDivision).filter(Boolean))].sort();
  const uniqueSubjectSlugs = [...new Set((results || []).map(r => r.subject))].sort();
  const hasActiveFilters = filterClass || filterDivision || filterSubject || filterDate || filterUser || searchQuery || filterStatus;

  const statusLabel = (s: string) => {
    switch (s) {
      case "completed": return "Completed";
      case "terminated": return "Terminated";
      case "started": return "In Progress";
      case "evaluating": return "Evaluating";
      case "reset_by_admin": return "Attempt Reset";
      default: return s;
    }
  };

  const filteredResults = (results || [])
    .filter(r => {
      if (filterClass && r.studentClass !== filterClass) return false;
      if (filterDivision && r.studentDivision !== filterDivision) return false;
      if (filterSubject && r.subject !== filterSubject) return false;
      if (filterUser) {
        const ownerId = subjectOwnerMap.get(r.subject);
        if (ownerId !== filterUser) return false;
      }
      if (filterDate) {
        const resultDate = new Date(r.timestamp).toISOString().split('T')[0];
        if (resultDate !== filterDate) return false;
      }
      if (filterStatus && r.status !== filterStatus) return false;
      if (searchQuery) {
        const q = searchQuery.trim().toLowerCase();
        const matches =
          (r.studentName || "").toLowerCase().includes(q) ||
          (r.studentEmail || "").toLowerCase().includes(q) ||
          (r.studentPhone || "").toLowerCase().includes(q) ||
          (r.studentRollNumber || "").toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    })
    .sort((a, b) => {
      let aVal: string | number = "";
      let bVal: string | number = "";
      switch (sortField) {
        case "name":    aVal = a.studentName.toLowerCase(); bVal = b.studentName.toLowerCase(); break;
        case "date":    aVal = new Date(a.timestamp).getTime(); bVal = new Date(b.timestamp).getTime(); break;
        case "score":   aVal = a.maxScore ? a.score / a.maxScore : 0; bVal = b.maxScore ? b.score / b.maxScore : 0; break;
        case "rollno":  aVal = (a.studentRollNumber || "").toLowerCase(); bVal = (b.studentRollNumber || "").toLowerCase(); break;
        case "class":   aVal = (a.studentClass || "").toLowerCase(); bVal = (b.studentClass || "").toLowerCase(); break;
        case "subject": aVal = a.subject.toLowerCase(); bVal = b.subject.toLowerCase(); break;
        case "status":  aVal = a.status.toLowerCase(); bVal = b.status.toLowerCase(); break;
      }
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

  const exportToExcel = () => {
    if (filteredResults.length === 0) {
      toast.error("No results to export");
      return;
    }
    const escCsv = (val: string) => {
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    };
    const headers = ["Name", "Roll No.", "Email", "Phone", "Class", "Division", "Subject", "Score", "Max Score", "Score %", "Status", "Date", "Has Photo", "Questions & Answers"];
    const rows = filteredResults.map(r => {
      const transcript = r.transcript.map((t, i) =>
        `Q${i + 1}: ${t.question} | A: ${t.answer} | Score: ${t.score} | Feedback: ${t.feedback}`
      ).join(' || ');
      return [
        escCsv(r.studentName),
        escCsv(r.studentRollNumber || ''),
        escCsv(r.studentEmail),
        escCsv(r.studentPhone),
        escCsv(r.studentClass || ''),
        escCsv(r.studentDivision || ''),
        escCsv(r.subject),
        String(r.score),
        String(r.maxScore),
        ((r.score / r.maxScore) * 100).toFixed(1),
        escCsv(statusLabel(r.status)),
        new Date(r.timestamp).toLocaleDateString(),
        r.studentPhoto ? 'Yes' : 'No',
        escCsv(transcript),
      ].join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `viva-results-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filteredResults.length} results`);
  };

  const exportToWord = () => {
    if (filteredResults.length === 0) {
      toast.error("No results to export");
      return;
    }
    const rows = filteredResults.map(r => {
      const pct = r.maxScore ? ((r.score / r.maxScore) * 100).toFixed(1) : "0.0";
      const qaRows = r.transcript.map((t, i) => `
        <tr>
          <td style="padding:4px 8px;border:1px solid #ccc;vertical-align:top;"><b>Q${i + 1}</b></td>
          <td style="padding:4px 8px;border:1px solid #ccc;vertical-align:top;">${t.question}</td>
          <td style="padding:4px 8px;border:1px solid #ccc;vertical-align:top;">${t.answer || "—"}</td>
          <td style="padding:4px 8px;border:1px solid #ccc;vertical-align:top;">${t.score ?? "—"}</td>
          <td style="padding:4px 8px;border:1px solid #ccc;vertical-align:top;">${t.feedback || "—"}</td>
        </tr>`).join("");
      return `
        <div style="page-break-inside:avoid;margin-bottom:28px;border:1px solid #ddd;border-radius:6px;padding:16px;font-family:Arial,sans-serif;">
          <table style="width:100%;border-collapse:collapse;margin-bottom:10px;">
            <tr><td style="width:140px;font-weight:bold;padding:2px 0;">Name</td><td>${r.studentName}</td>
                <td style="width:140px;font-weight:bold;padding:2px 0;">Roll No.</td><td>${r.studentRollNumber || "—"}</td></tr>
            <tr><td style="font-weight:bold;padding:2px 0;">Email</td><td>${r.studentEmail}</td>
                <td style="font-weight:bold;padding:2px 0;">Phone</td><td>${r.studentPhone || "—"}</td></tr>
            <tr><td style="font-weight:bold;padding:2px 0;">Class</td><td>${r.studentClass || "—"}</td>
                <td style="font-weight:bold;padding:2px 0;">Division</td><td>${r.studentDivision || "—"}</td></tr>
            <tr><td style="font-weight:bold;padding:2px 0;">Subject</td><td>${r.subject}</td>
                <td style="font-weight:bold;padding:2px 0;">Date</td><td>${new Date(r.timestamp).toLocaleDateString()}</td></tr>
            <tr><td style="font-weight:bold;padding:2px 0;">Score</td><td>${r.score}/${r.maxScore} (${pct}%)</td>
                <td style="font-weight:bold;padding:2px 0;">Status</td><td><b>${statusLabel(r.status)}</b></td></tr>
          </table>
          ${r.transcript.length > 0 ? `
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead>
              <tr style="background:#f3f4f6;">
                <th style="padding:4px 8px;border:1px solid #ccc;">#</th>
                <th style="padding:4px 8px;border:1px solid #ccc;">Question</th>
                <th style="padding:4px 8px;border:1px solid #ccc;">Answer</th>
                <th style="padding:4px 8px;border:1px solid #ccc;">Score</th>
                <th style="padding:4px 8px;border:1px solid #ccc;">Feedback</th>
              </tr>
            </thead>
            <tbody>${qaRows}</tbody>
          </table>` : "<p style='color:#888;font-size:12px;'>No transcript available.</p>"}
        </div>`;
    }).join("");

    const html = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><title>Viva Results</title></head>
      <body style="font-family:Arial,sans-serif;font-size:13px;">
        <h2 style="color:#5b21b6;margin-bottom:4px;">AI Mock Viva — Results Report</h2>
        <p style="color:#888;margin-top:0;margin-bottom:24px;">Exported on ${new Date().toLocaleDateString()} · ${filteredResults.length} record(s)</p>
        ${rows}
      </body></html>`;

    const blob = new Blob(['\ufeff' + html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `viva-results-${new Date().toISOString().split('T')[0]}.doc`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filteredResults.length} results to Word`);
  };

  const stats = {
    total: results?.length || 0,
    avgScore: (() => {
      const scoreable = results?.filter(r => r.maxScore > 0) ?? [];
      if (scoreable.length === 0) return "0.0";
      return (scoreable.reduce((acc, r) => acc + (r.score / r.maxScore) * 100, 0) / scoreable.length).toFixed(1);
    })(),
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
                <div className="mb-4 p-3 bg-muted/40 rounded-lg border">
                  <div className="flex items-center gap-2 mb-2">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Filters</span>
                    {hasActiveFilters && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => { setFilterClass(""); setFilterDivision(""); setFilterSubject(""); setFilterDate(""); setFilterUser(""); setSearchQuery(""); setFilterStatus(""); setSortField("date"); setSortDir("desc"); }}
                        data-testid="button-clear-filters"
                      >
                        <X className="h-3 w-3 mr-1" /> Clear all
                      </Button>
                    )}
                  </div>
                  <div className="relative mb-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      placeholder="Search by name, email, phone or roll number…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 h-9 text-sm"
                      data-testid="input-search-student"
                    />
                  </div>
                  <div className={`grid grid-cols-2 ${isAdmin ? 'md:grid-cols-6' : 'md:grid-cols-5'} gap-2`}>
                    {isAdmin && (
                      <select
                        value={filterUser}
                        onChange={(e) => setFilterUser(e.target.value)}
                        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                        data-testid="filter-user"
                      >
                        <option value="">All Users</option>
                        {(adminUsers || []).map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
                      </select>
                    )}
                    <select
                      value={filterClass}
                      onChange={(e) => setFilterClass(e.target.value)}
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                      data-testid="filter-class"
                    >
                      <option value="">All Classes</option>
                      {uniqueClasses.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select
                      value={filterDivision}
                      onChange={(e) => setFilterDivision(e.target.value)}
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                      data-testid="filter-division"
                    >
                      <option value="">All Divisions</option>
                      {uniqueDivisions.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <select
                      value={filterSubject}
                      onChange={(e) => setFilterSubject(e.target.value)}
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                      data-testid="filter-subject"
                    >
                      <option value="">All Subjects</option>
                      {uniqueSubjectSlugs.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                      data-testid="filter-status"
                    >
                      <option value="">All Statuses</option>
                      <option value="completed">Completed</option>
                      <option value="terminated">Terminated</option>
                      <option value="evaluating">Evaluating</option>
                      <option value="started">In Progress</option>
                      <option value="reset_by_admin">Attempt Reset</option>
                    </select>
                    <Input
                      type="date"
                      value={filterDate}
                      onChange={(e) => setFilterDate(e.target.value)}
                      className="h-9"
                      data-testid="filter-date"
                    />
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-muted-foreground font-medium whitespace-nowrap">Sort by:</span>
                    <select
                      value={sortField}
                      onChange={(e) => setSortField(e.target.value)}
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs flex-1 min-w-0"
                      data-testid="sort-field"
                    >
                      <option value="date">Date</option>
                      <option value="name">Name</option>
                      <option value="score">Score %</option>
                      <option value="rollno">Roll No.</option>
                      <option value="class">Class</option>
                      <option value="subject">Subject</option>
                      <option value="status">Status</option>
                    </select>
                    <button
                      onClick={() => setSortDir(d => d === "asc" ? "desc" : "asc")}
                      className="h-8 px-2 rounded-md border border-input bg-background text-xs hover:bg-muted flex items-center gap-1 whitespace-nowrap"
                      data-testid="sort-direction"
                      title={sortDir === "asc" ? "Ascending" : "Descending"}
                    >
                      {sortDir === "asc" ? "↑ Asc" : "↓ Desc"}
                    </button>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    {hasActiveFilters ? (
                      <p className="text-xs text-muted-foreground">
                        Showing {filteredResults.length} of {results?.length || 0} results
                      </p>
                    ) : <span />}
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={exportToWord}
                        disabled={filteredResults.length === 0}
                        data-testid="button-export-word"
                      >
                        <Download className="h-4 w-4 mr-1" />
                        Export to Word
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={exportToExcel}
                        disabled={filteredResults.length === 0}
                        data-testid="button-export-excel"
                      >
                        <Download className="h-4 w-4 mr-1" />
                        Export to Excel
                      </Button>
                    </div>
                  </div>
                </div>

                {isLoading ? (
                  <div className="flex items-center justify-center py-12" data-testid="loading-results">
                    <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
                  </div>
                ) : filteredResults.length > 0 ? (
                  <ScrollArea className="h-[500px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-gray-300 accent-violet-600 cursor-pointer"
                              checked={filteredResults.filter(r => r.status === "terminated").length > 0 && filteredResults.filter(r => r.status === "terminated").every(r => selectedIds.has(r.id))}
                              onChange={(e) => {
                                const terminatedIds = filteredResults.filter(r => r.status === "terminated").map(r => r.id);
                                if (e.target.checked) {
                                  setSelectedIds(prev => new Set([...prev, ...terminatedIds]));
                                } else {
                                  setSelectedIds(prev => { const next = new Set(prev); terminatedIds.forEach(id => next.delete(id)); return next; });
                                }
                              }}
                              title="Select all terminated"
                              data-testid="checkbox-select-all-terminated"
                            />
                          </TableHead>
                          <TableHead>Student</TableHead>
                          <TableHead>Subject</TableHead>
                          <TableHead>Score</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Photo</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredResults.map((result) => (
                          <TableRow
                            key={result.id}
                            className={`cursor-pointer hover:bg-violet-50 ${selectedIds.has(result.id) ? "bg-violet-50" : ""}`}
                            onClick={() => setSelectedResult(result)}
                            data-testid={`row-result-${result.id}`}
                          >
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              {result.status === "terminated" && (
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 rounded border-gray-300 accent-violet-600 cursor-pointer"
                                  checked={selectedIds.has(result.id)}
                                  onChange={(e) => {
                                    setSelectedIds(prev => {
                                      const next = new Set(prev);
                                      e.target.checked ? next.add(result.id) : next.delete(result.id);
                                      return next;
                                    });
                                  }}
                                  data-testid={`checkbox-result-${result.id}`}
                                />
                              )}
                            </TableCell>
                            <TableCell>
                              <div>
                                <div className="font-medium">{result.studentName}</div>
                                <div className="text-sm text-muted-foreground">{result.studentEmail}</div>
                                {result.studentRollNumber && (
                                  <div className="text-xs text-muted-foreground mt-0.5">
                                    Roll No: {result.studentRollNumber}
                                  </div>
                                )}
                                {(result.studentClass || result.studentDivision) && (
                                  <div className="text-xs text-muted-foreground mt-0.5">
                                    {result.studentClass}{result.studentClass && result.studentDivision ? ' · ' : ''}{result.studentDivision}
                                  </div>
                                )}
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
                              {result.status === "evaluating" ? (
                                <Badge variant="default" className="bg-yellow-500 text-black">
                                  <Clock className="h-3 w-3 mr-1 animate-spin" />
                                  In Progress
                                </Badge>
                              ) : result.status === "terminated" ? (
                                <Badge variant="default" className="bg-red-600">
                                  <XCircle className="h-3 w-3 mr-1" />
                                  Terminated
                                </Badge>
                              ) : result.status === "reset_by_admin" ? (
                                <Badge variant="default" className="bg-orange-500">
                                  Attempt Reset
                                </Badge>
                              ) : result.status === "started" ? (
                                <Badge variant="default" className="bg-blue-500">
                                  In Progress
                                </Badge>
                              ) : (
                                <Badge variant="default" className="bg-green-600">
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  Completed
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {result.studentPhoto ? (
                                <img
                                  src={result.studentPhoto}
                                  alt="Student"
                                  className="w-10 h-10 rounded object-cover border border-gray-200"
                                  data-testid={`img-student-photo-${result.id}`}
                                />
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
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
                    {hasActiveFilters ? "No results match the selected filters" : "No examination results yet"}
                  </div>
                )}

                {selectedIds.size > 0 && (
                  <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-zinc-900 text-white px-5 py-3 rounded-xl shadow-2xl border border-zinc-700" data-testid="bulk-action-bar">
                    <span className="text-sm font-medium">{selectedIds.size} terminated {selectedIds.size === 1 ? "record" : "records"} selected</span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs border-zinc-500 text-white bg-transparent hover:bg-zinc-700"
                      onClick={() => setSelectedIds(new Set())}
                      data-testid="button-deselect-all"
                    >
                      <X className="h-3 w-3 mr-1" />
                      Deselect All
                    </Button>
                    <Button
                      size="sm"
                      className="h-8 text-xs bg-orange-500 hover:bg-orange-600 text-white"
                      disabled={bulkResetMutation.isPending}
                      onClick={() => bulkResetMutation.mutate(Array.from(selectedIds))}
                      data-testid="button-bulk-reset"
                    >
                      {bulkResetMutation.isPending ? (
                        <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Resetting…</>
                      ) : (
                        "Allow Re-attempt"
                      )}
                    </Button>
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
                    <div
                      key={subject.slug}
                      className={`flex items-center justify-between p-4 border rounded-lg transition-opacity ${subject.isActive === false ? "opacity-60 bg-muted/40" : ""}`}
                    >
                      <div className="flex items-center gap-4">
                        <div>
                          <p className="font-medium">{subject.name}</p>
                          <p className="text-sm text-muted-foreground">/{subject.slug}</p>
                        </div>
                        {subject.isBuiltIn && (
                          <Badge variant="secondary">Built-in</Badge>
                        )}
                        {subject.isActive === false && (
                          <Badge variant="outline" className="text-yellow-600 border-yellow-400 bg-yellow-50">
                            Deactivated
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={subject.isActive === false}
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
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openEditDialog(subject)}
                              data-testid={`button-edit-subject-${subject.slug}`}
                            >
                              <Edit2 className="h-4 w-4 mr-1" />
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className={subject.isActive === false
                                ? "border-green-500 text-green-600 hover:bg-green-50"
                                : "border-yellow-500 text-yellow-600 hover:bg-yellow-50"}
                              disabled={toggleSubjectActiveMutation.isPending}
                              onClick={() => toggleSubjectActiveMutation.mutate({ id: subject.id!, isActive: subject.isActive !== true })}
                              data-testid={`button-toggle-active-${subject.slug}`}
                            >
                              {subject.isActive === false ? "Activate" : "Deactivate"}
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => deleteSubjectMutation.mutate(subject.id!)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
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
                          <div key={q.id} className="flex items-start gap-2 p-3 border rounded-lg">
                            {editingQuestionId === q.id ? (
                              <div className="flex-1 space-y-2">
                                <Textarea
                                  value={editingQuestionText}
                                  onChange={(e) => setEditingQuestionText(e.target.value)}
                                  className="min-h-[60px] text-sm"
                                  data-testid={`input-edit-question-${q.id}`}
                                />
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    onClick={() => updateQuestionMutation.mutate({ id: q.id, questionText: editingQuestionText })}
                                    disabled={!editingQuestionText.trim() || updateQuestionMutation.isPending}
                                    data-testid={`button-save-question-${q.id}`}
                                  >
                                    {updateQuestionMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                                    Save
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => { setEditingQuestionId(null); setEditingQuestionText(""); }}
                                    data-testid={`button-cancel-edit-${q.id}`}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <p className="flex-1">{q.questionText}</p>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => { setEditingQuestionId(q.id); setEditingQuestionText(q.questionText); }}
                                  data-testid={`button-edit-question-${q.id}`}
                                >
                                  <Edit2 className="h-4 w-4 text-blue-500" />
                                </Button>
                              </>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteQuestionMutation.mutate(q.id)}
                              data-testid={`button-delete-question-${q.id}`}
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

                    <div className="mt-8 pt-6 border-t">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="font-semibold flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            Reference Documents
                          </h3>
                          <p className="text-sm text-muted-foreground">Upload PDF or DOCX files. The AI will use their content to generate and evaluate questions.</p>
                        </div>
                        <div>
                          <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                            className="hidden"
                            data-testid="input-document-upload"
                            onChange={(e) => {
                              const files = e.target.files;
                              if (files && files.length > 0 && selectedSubjectSlug) {
                                Array.from(files).forEach(file => {
                                  uploadDocumentMutation.mutate({ subjectSlug: selectedSubjectSlug, file });
                                });
                              }
                              e.target.value = '';
                            }}
                          />
                          <Button
                            size="sm"
                            disabled={uploadDocumentMutation.isPending}
                            data-testid="button-upload-document"
                            onClick={() => fileInputRef.current?.click()}
                          >
                            {uploadDocumentMutation.isPending ? (
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                              <Upload className="h-4 w-4 mr-1" />
                            )}
                            Upload Files
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        {documents && documents.length > 0 ? (
                          documents.map((doc) => (
                            <div key={doc.id} className="flex items-center justify-between p-3 border rounded-lg" data-testid={`row-document-${doc.id}`}>
                              <div className="flex items-center gap-3">
                                <FileText className="h-5 w-5 text-violet-500" />
                                <div>
                                  <p className="font-medium text-sm">{doc.fileName}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {doc.fileType === 'application/pdf' ? 'PDF' : 'DOCX'} · {Math.round(doc.textLength / 1000)}k characters extracted
                                  </p>
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => deleteDocumentMutation.mutate(doc.id)}
                                data-testid={`button-delete-document-${doc.id}`}
                              >
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </div>
                          ))
                        ) : (
                          <p className="text-muted-foreground text-center py-4 text-sm">
                            No documents uploaded. Upload PDF or DOCX files to provide reference material for the AI.
                          </p>
                        )}
                      </div>
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
                  <p className="text-sm text-muted-foreground">Roll No.</p>
                  <p className="font-medium">{selectedResult.studentRollNumber || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Class</p>
                  <p className="font-medium">{selectedResult.studentClass || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Division</p>
                  <p className="font-medium">{selectedResult.studentDivision || "—"}</p>
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

              <div className="mb-4 flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-orange-400 text-orange-600 hover:bg-orange-50"
                  disabled={resetAttemptMutation.isPending}
                  onClick={() => {
                    if (confirm(`Reset attempt for ${selectedResult.studentName} (${selectedResult.studentEmail}) on subject "${selectedResult.subject}"? They will be able to retake the exam.`)) {
                      resetAttemptMutation.mutate({ email: selectedResult.studentEmail, subject: selectedResult.subject });
                    }
                  }}
                  data-testid="button-reset-attempt"
                >
                  {resetAttemptMutation.isPending ? "Resetting..." : "Reset Attempt"}
                </Button>
                <p className="text-xs text-muted-foreground">Allows this student to retake the exam for this subject.</p>
              </div>

              {selectedResult.studentPhoto && (
                <div className="mb-4">
                  <h3 className="font-semibold mb-2">Student Photo</h3>
                  <img
                    src={selectedResult.studentPhoto}
                    alt="Student during exam"
                    className="rounded-lg border border-gray-200 max-w-xs"
                    data-testid="img-detail-student-photo"
                  />
                </div>
              )}

              <div>
                <h3 className="font-semibold mb-4">Transcript</h3>
                <div className="space-y-4">
                  {selectedResult.transcript.map((item, index) => (
                    <Card key={index}>
                      <CardContent className="pt-6 space-y-3">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">
                            {item.dimensionScores ? `Prospect Challenge ${index + 1}` : `Question ${index + 1}`}
                          </p>
                          <p className="font-medium">{item.question}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">
                            {item.dimensionScores ? "Sales Rep Response" : "Student Answer"}
                          </p>
                          <p>{item.answer}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Feedback</p>
                          <p className="text-sm">{item.feedback}</p>
                        </div>
                        {item.dimensionScores ? (
                          <div className="space-y-2">
                            <p className="text-sm font-medium text-muted-foreground">Dimension Scores</p>
                            <div className="grid grid-cols-2 gap-2">
                              {[
                                { label: "Content Accuracy", value: item.dimensionScores.contentAccuracy },
                                { label: "Confidence", value: item.dimensionScores.confidence },
                                { label: "Clarity", value: item.dimensionScores.clarity },
                                { label: "Sales Effectiveness", value: item.dimensionScores.salesEffectiveness },
                              ].map(({ label, value }) => (
                                <div key={label} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                                  <span className="text-muted-foreground">{label}</span>
                                  <Badge variant={value >= 7 ? "default" : value >= 5 ? "secondary" : "destructive"}>
                                    {value}/10
                                  </Badge>
                                </div>
                              ))}
                            </div>
                            <Badge variant={item.score >= 7 ? "default" : item.score >= 5 ? "secondary" : "destructive"}>
                              Overall: {item.score}/10
                            </Badge>
                          </div>
                        ) : (
                          <Badge variant={item.score >= 7 ? "default" : item.score >= 5 ? "secondary" : "destructive"}>
                            Score: {item.score}/10
                          </Badge>
                        )}
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
              {newSubject.name && (
                <p className="text-xs text-muted-foreground mt-1">
                  Students will access via /{newSubject.name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'slug'}
                </p>
              )}
            </div>
            <div>
              <Label>Subject Type</Label>
              <select
                value={newSubject.subjectType}
                onChange={(e) => setNewSubject({ ...newSubject, subjectType: e.target.value })}
                className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-background text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                data-testid="select-subject-type"
              >
                <option value="academic">Academic — standard oral exam with Q&amp;A scoring</option>
                <option value="sales">Sales — prospect roleplay with 4-dimension evaluation</option>
              </select>
              <p className="text-xs text-muted-foreground mt-1">
                Sales mode uses a roleplay format where AI acts as a skeptical prospect and scores Content Accuracy, Confidence, Clarity, and Sales Effectiveness.
              </p>
            </div>
            <div>
              <Label>Curriculum Topics</Label>
              <Textarea
                placeholder={"e.g.:\n\nData Types:\n- Variables and constants\n- Strings and numbers\n- Lists and dictionaries\n\nControl Flow:\n- If/else statements\n- For and while loops"}
                value={newSubject.curriculum}
                onChange={(e) => setNewSubject({ ...newSubject, curriculum: e.target.value })}
                className="min-h-[150px] text-sm"
                data-testid="input-curriculum"
              />
              <p className="text-xs text-muted-foreground mt-2">
                List topics line by line. Use a heading ending with <strong>:</strong> to group into modules. Leave empty for default.
              </p>
              <div className="mt-2 p-3 bg-muted/50 rounded-lg">
                <p className="text-xs font-medium mb-1">Example:</p>
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap">{'Module 1: Basics:\nVariables and data types\nInput and output\n\nModule 2: Control Flow:\nIf/else statements\nLoops and iteration'}</pre>
              </div>
            </div>
            <div>
              <Label>
                Exam Instructions{" "}
                <span className="text-muted-foreground font-normal">(Optional)</span>
              </Label>
              <Textarea
                placeholder={"e.g.:\nFocus only on practical application questions.\nScore strictly — penalise vague or one-word answers.\nAlways include one question on error handling."}
                value={newSubject.instructions}
                onChange={(e) => setNewSubject({ ...newSubject, instructions: e.target.value })}
                className="min-h-[100px] text-sm"
                data-testid="input-exam-instructions"
              />
              <p className="text-xs text-muted-foreground mt-2">
                These instructions are passed directly to the AI to control how it generates questions and evaluates answers for this subject.
              </p>
            </div>
            <div>
              <Label>
                Allowed Emails{" "}
                <span className="text-muted-foreground font-normal">(Optional — leave blank to allow all)</span>
              </Label>
              <Textarea
                placeholder={"student1@example.com\nstudent2@example.com\nstudent3@example.com"}
                value={newSubject.allowedEmails}
                onChange={(e) => setNewSubject({ ...newSubject, allowedEmails: e.target.value })}
                className="min-h-[100px] text-sm"
                data-testid="input-allowed-emails"
              />
              <p className="text-xs text-muted-foreground mt-2">
                Enter one email per line (or comma-separated). Only these students will be able to start this exam. Leave blank to allow anyone.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSubjectDialog(false)}>Cancel</Button>
            <Button onClick={handleCreateSubject} disabled={!newSubject.name.trim()}>
              Create Subject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Subject Dialog */}
      <Dialog open={!!editingSubject} onOpenChange={(open) => { if (!open) setEditingSubject(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Subject</DialogTitle>
            <DialogDescription>
              Update the subject details. The URL slug (<strong>/{editingSubject?.slug}</strong>) cannot be changed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Subject Name</Label>
              <Input
                placeholder="e.g., Introduction to Python"
                value={editSubjectData.name}
                onChange={(e) => setEditSubjectData({ ...editSubjectData, name: e.target.value })}
                data-testid="input-edit-subject-name"
              />
            </div>
            <div>
              <Label>Subject Type</Label>
              <select
                value={editSubjectData.subjectType}
                onChange={(e) => setEditSubjectData({ ...editSubjectData, subjectType: e.target.value })}
                className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-background text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                data-testid="select-edit-subject-type"
              >
                <option value="academic">Academic — standard oral exam with Q&amp;A scoring</option>
                <option value="sales">Sales — prospect roleplay with 4-dimension evaluation</option>
              </select>
            </div>
            <div>
              <Label>Curriculum Topics</Label>
              <Textarea
                placeholder={"e.g.:\n\nData Types:\n- Variables and constants\n- Strings and numbers\n\nControl Flow:\n- If/else statements\n- For and while loops"}
                value={editSubjectData.curriculum}
                onChange={(e) => setEditSubjectData({ ...editSubjectData, curriculum: e.target.value })}
                className="min-h-[160px] text-sm"
                data-testid="input-edit-curriculum"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Use a heading ending with <strong>:</strong> to group into modules. Topics go on lines below it.
              </p>
            </div>
            <div>
              <Label>
                Exam Instructions{" "}
                <span className="text-muted-foreground font-normal">(Optional)</span>
              </Label>
              <Textarea
                placeholder={"e.g.:\nFocus only on practical application questions.\nScore strictly — penalise vague or one-word answers."}
                value={editSubjectData.instructions}
                onChange={(e) => setEditSubjectData({ ...editSubjectData, instructions: e.target.value })}
                className="min-h-[100px] text-sm"
                data-testid="input-edit-instructions"
              />
            </div>
            <div>
              <Label>
                Allowed Emails{" "}
                <span className="text-muted-foreground font-normal">(Optional — leave blank to allow all)</span>
              </Label>
              <Textarea
                placeholder={"student1@example.com\nstudent2@example.com"}
                value={editSubjectData.allowedEmails}
                onChange={(e) => setEditSubjectData({ ...editSubjectData, allowedEmails: e.target.value })}
                className="min-h-[80px] text-sm"
                data-testid="input-edit-allowed-emails"
              />
              <p className="text-xs text-muted-foreground mt-1">
                One email per line or comma-separated. Leave blank to allow anyone.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingSubject(null)}>Cancel</Button>
            <Button
              onClick={handleUpdateSubject}
              disabled={!editSubjectData.name.trim() || updateSubjectMutation.isPending}
            >
              {updateSubjectMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Question Dialog */}
      <Dialog open={showQuestionDialog} onOpenChange={setShowQuestionDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Manual Questions</DialogTitle>
            <DialogDescription>Add one or multiple questions at once. These will be used instead of AI-generated ones.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Questions</Label>
              <Textarea
                placeholder={"Enter one question per line, e.g.:\n\nWhat is polymorphism in OOP? Give an example.\nDescribe the process of photosynthesis and explain its importance.\nCompare and contrast TCP and UDP protocols."}
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                className="min-h-[180px] font-mono text-sm"
                data-testid="input-question-text"
              />
              <div className="flex items-center justify-between mt-2">
                <p className="text-xs text-muted-foreground">
                  Put each question on a separate line. Empty lines will be ignored.
                </p>
                {newQuestion.trim() && (
                  <Badge variant="secondary" className="text-xs">
                    {newQuestion.split('\n').filter(l => l.trim()).length} question{newQuestion.split('\n').filter(l => l.trim()).length !== 1 ? 's' : ''}
                  </Badge>
                )}
              </div>
              <div className="mt-3 p-3 bg-muted/50 rounded-lg">
                <p className="text-xs font-medium mb-1">Example format:</p>
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap">What is polymorphism in OOP? Give an example.{'\n'}Describe the process of photosynthesis.{'\n'}Compare and contrast TCP and UDP protocols.</pre>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowQuestionDialog(false)}>Cancel</Button>
            <Button 
              onClick={() => {
                if (!selectedSubjectSlug) return;
                const lines = newQuestion.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                if (lines.length === 1) {
                  createQuestionMutation.mutate({
                    subjectSlug: selectedSubjectSlug,
                    questionText: lines[0],
                  });
                } else if (lines.length > 1) {
                  bulkCreateQuestionsMutation.mutate({
                    subjectSlug: selectedSubjectSlug,
                    questions: lines,
                  });
                }
              }}
              disabled={!newQuestion.trim() || bulkCreateQuestionsMutation.isPending || createQuestionMutation.isPending}
              data-testid="button-submit-questions"
            >
              {(bulkCreateQuestionsMutation.isPending || createQuestionMutation.isPending) && (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              )}
              {newQuestion.split('\n').filter(l => l.trim()).length > 1
                ? `Add ${newQuestion.split('\n').filter(l => l.trim()).length} Questions`
                : "Add Question"}
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
