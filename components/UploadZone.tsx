'use client'

import { useCallback, useState } from 'react'
import { Upload, FileText, X } from 'lucide-react'

interface UploadZoneProps {
  onUpload: (files: File[]) => void
  isProcessing: boolean
}

export default function UploadZone({ onUpload, isProcessing }: UploadZoneProps) {
  const [dragOver, setDragOver] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) return
    const valid = Array.from(files).filter(f =>
      ['pdf', 'csv', 'xlsx', 'xls'].includes(f.name.split('.').pop()?.toLowerCase() || '')
    )
    setSelectedFiles(prev => {
      const names = new Set(prev.map(f => f.name))
      return [...prev, ...valid.filter(f => !names.has(f.name))]
    })
  }, [])

  const removeFile = (name: string) => {
    setSelectedFiles(prev => prev.filter(f => f.name !== name))
  }

  const handleSubmit = () => {
    if (selectedFiles.length > 0) {
      onUpload(selectedFiles)
    }
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
        className={`border-2 border-dashed rounded-xl p-10 text-center transition-all cursor-pointer ${
          dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400 bg-gray-50'
        }`}
        onClick={() => document.getElementById('file-input')?.click()}
      >
        <Upload className="mx-auto mb-3 text-gray-400" size={40} />
        <p className="text-lg font-medium text-gray-700">Drop files here or click to upload</p>
        <p className="text-sm text-gray-500 mt-1">Supports PDF bank statements, CSV exports, Excel files (.xlsx/.xls)</p>
        <p className="text-xs text-gray-400 mt-1">Amazon order history, Chase, Bank of America, Wells Fargo, etc.</p>
        <input
          id="file-input"
          type="file"
          multiple
          accept=".pdf,.csv,.xlsx,.xls"
          className="hidden"
          onChange={e => handleFiles(e.target.files)}
        />
      </div>

      {selectedFiles.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-600">{selectedFiles.length} file(s) ready</p>
          {selectedFiles.map(file => (
            <div key={file.name} className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-2">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-blue-500" />
                <span className="text-sm text-gray-700">{file.name}</span>
                <span className="text-xs text-gray-400">({(file.size / 1024).toFixed(0)} KB)</span>
              </div>
              <button
                onClick={e => { e.stopPropagation(); removeFile(file.name) }}
                className="text-gray-400 hover:text-red-500 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          ))}
          <button
            onClick={handleSubmit}
            disabled={isProcessing}
            className="w-full mt-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium py-3 px-6 rounded-xl transition-colors"
          >
            {isProcessing ? 'Analyzing with AI...' : `Analyze ${selectedFiles.length} File(s)`}
          </button>
        </div>
      )}
    </div>
  )
}
