import React, { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle, Shield, AlertTriangle, Loader2, Image as ImageIcon, Trash2 } from 'lucide-react';

interface UploadManagerProps {
  apiBase: string;
  onUploadSuccess: (analysis: {
    totalPages: number;
    totalColorPages: number;
    totalBwPages: number;
    pageSize: string;
    files: Array<{
      originalName: string;
      filePath: string;
      size: number;
      mimetype: string;
      pages: number;
      colorPages: number;
      bwPages: number;
      pageSize: string;
      isSafe: boolean;
    }>;
  }) => void;
  onClear: () => void;
}

export default function UploadManager({ apiBase, onUploadSuccess, onClear }: UploadManagerProps) {
  const [uploading, setUploading] = useState(false);
  const [files, setFiles] = useState<any[]>([]);
  const [analysisSummary, setAnalysisSummary] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // File Validation
  const validateFiles = (selectedFiles: FileList): boolean => {
    const allowedExtensions = ['.pdf', '.docx', '.png', '.jpg', '.jpeg'];
    
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      
      if (!allowedExtensions.includes(ext)) {
        setError(`Invalid file type: "${file.name}". Only PDF, DOCX, PNG, and JPG files are allowed.`);
        return false;
      }

      if (file.size > 50 * 1024 * 1024) {
        setError(`File too large: "${file.name}" exceeds the 50MB limits.`);
        return false;
      }
    }
    return true;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    setError(null);
    if (!validateFiles(selectedFiles)) return;

    setUploading(true);
    setFiles(Array.from(selectedFiles));

    const formData = new FormData();
    for (let i = 0; i < selectedFiles.length; i++) {
      formData.append('files', selectedFiles[i]);
    }

    try {
      const res = await fetch(`${apiBase}/upload`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (data.success) {
        setAnalysisSummary(data.analysis);
        setLogs('SYSTEM SECURE: Checked magic hex-headers. No malicious script actions found inside streams.');
        onUploadSuccess(data.analysis);
      } else {
        setError(data.error || 'Security or verification exception during upload.');
        if (data.details) {
          setLogs(data.details);
        }
        onClear();
      }
    } catch (err) {
      setError('Network connection error during file upload.');
      onClear();
    } finally {
      setUploading(false);
    }
  };

  const clearAll = () => {
    setFiles([]);
    setAnalysisSummary(null);
    setError(null);
    setLogs('');
    onClear();
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="font-extrabold text-slate-800 text-sm flex items-center gap-2">
          <Upload size={18} className="text-emerald-500" /> Upload Documents
        </h4>
        {(files.length > 0 || analysisSummary) && (
          <button 
            type="button" 
            onClick={clearAll}
            className="text-[11px] font-bold text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100/60 px-2.5 py-1 rounded-lg transition-colors"
          >
            Clear Uploads
          </button>
        )}
      </div>

      {files.length === 0 ? (
        <div 
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-2xl p-8 text-center cursor-pointer transition-colors duration-200 bg-slate-50/50 group"
        >
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange}
            multiple 
            accept=".pdf,.docx,.png,.jpg,.jpeg"
            className="hidden" 
          />
          <div className="flex flex-col items-center py-2">
            <div className="w-10 h-10 rounded-xl bg-slate-100 group-hover:bg-emerald-50 text-slate-600 group-hover:text-emerald-600 flex items-center justify-center mb-3 transition-colors">
              <Upload size={20} />
            </div>
            <p className="font-extrabold text-slate-700 text-xs">Drag & Drop or Click to Upload</p>
            <p className="text-slate-400 text-[10px] mt-1">Multi-file support active. PDF, DOCX, PNG, JPG (Max 50MB)</p>
          </div>
        </div>
      ) : (
        /* File listings and analysis summary */
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {files.map((file, idx) => {
              const ext = '.' + file.name.split('.').pop()?.toLowerCase();
              const isImage = ['.png', '.jpg', '.jpeg'].includes(ext);

              return (
                <div key={idx} className="border border-slate-100 rounded-xl p-3 bg-slate-50/50 flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg">
                    {isImage ? <ImageIcon size={16} /> : <FileText size={16} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-extrabold text-slate-800 text-[11px] truncate">{file.name}</p>
                    <p className="text-[10px] text-slate-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                </div>
              );
            })}
          </div>

          {uploading && (
            <div className="flex items-center justify-center gap-2 py-4 text-xs font-bold text-slate-600">
              <Loader2 className="animate-spin text-emerald-500" size={16} /> Evaluating file security signatures...
            </div>
          )}

          {analysisSummary && (
            <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-4 space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs text-emerald-800 font-bold">
                <Shield size={14} className="text-emerald-600" /> Integrated Security Scanner Checked OK!
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-white rounded-lg p-2 border border-emerald-100/40">
                  <span className="text-[9px] font-bold text-slate-400 block uppercase">Total Sheets</span>
                  <span className="text-sm font-extrabold text-slate-800">{analysisSummary.totalPages}</span>
                </div>
                <div className="bg-white rounded-lg p-2 border border-emerald-100/40">
                  <span className="text-[9px] font-bold text-slate-400 block uppercase">Grayscale B&W</span>
                  <span className="text-sm font-extrabold text-slate-800">{analysisSummary.totalBwPages}</span>
                </div>
                <div className="bg-white rounded-lg p-2 border border-emerald-100/40">
                  <span className="text-[9px] font-bold text-slate-400 block uppercase">RGB Color</span>
                  <span className="text-sm font-extrabold text-slate-800">{analysisSummary.totalColorPages}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-[11px] text-red-600 flex gap-2">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
          <span><span className="font-bold">Error:</span> {error}</span>
        </div>
      )}

      {logs && (
        <div className="bg-slate-900 rounded-xl p-2.5 font-mono text-[9px] text-slate-300 max-h-24 overflow-y-auto leading-relaxed">
          <span className="text-emerald-400 font-bold">$ scan-guard:</span> {logs}
        </div>
      )}
    </div>
  );
}
