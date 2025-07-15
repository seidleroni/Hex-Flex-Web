
import React, { useState, useCallback, useRef } from 'react';
import { UploadIcon } from './Icons';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  className?: string;
}

const FileUpload: React.FC<FileUploadProps> = ({ 
  onFileSelect,
  title = <><span className="text-cyan-400">Click to upload</span> or drag and drop a file</>,
  subtitle = "Intel HEX (.hex) files only",
  className
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFileSelect(e.dataTransfer.files[0]);
      e.dataTransfer.clearData();
    }
  }, [onFileSelect]);
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileSelect(e.target.files[0]);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div
      className={`mt-10 p-8 border-2 border-dashed rounded-xl transition-all duration-300 ${
        isDragging ? 'border-cyan-400 bg-gray-700/50 scale-105' : 'border-gray-600 hover:border-cyan-500 bg-gray-800'
      } ${className || ''}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleClick()}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".hex"
        className="hidden"
        onChange={handleFileChange}
        aria-label="File upload input"
      />
      <div className="flex flex-col items-center justify-center space-y-4 text-center">
        <UploadIcon className="w-16 h-16 text-gray-500" />
        <p className="text-xl font-semibold text-gray-300">
          {title}
        </p>
        <p className="text-gray-400">{subtitle}</p>
      </div>
    </div>
  );
};

export default FileUpload;
