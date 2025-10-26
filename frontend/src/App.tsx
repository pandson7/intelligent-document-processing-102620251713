import React, { useState } from 'react';
import axios from 'axios';
import './App.css';

const API_BASE_URL = 'https://arjxjxyakl.execute-api.us-east-1.amazonaws.com/prod';

interface ProcessingResult {
  documentId: string;
  fileName: string;
  fileType: string;
  status: string;
  uploadTimestamp: string;
  lastUpdated: string;
  ocrResults: Record<string, string> | null;
  classification: string | null;
  summary: string | null;
}

function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<ProcessingResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const validTypes = ['image/jpeg', 'image/png', 'application/pdf'];
      if (validTypes.includes(file.type)) {
        setSelectedFile(file);
        setError(null);
      } else {
        setError('Please select a JPEG, PNG, or PDF file');
        setSelectedFile(null);
      }
    }
  };

  const uploadFile = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setError(null);

    try {
      // Get presigned URL
      const uploadResponse = await axios.post(`${API_BASE_URL}/upload`, {
        fileName: selectedFile.name,
        fileType: selectedFile.type
      });

      const { documentId, uploadUrl } = uploadResponse.data;

      // Upload file to S3
      await axios.put(uploadUrl, selectedFile, {
        headers: {
          'Content-Type': selectedFile.type
        }
      });

      setUploading(false);
      setProcessing(true);

      // Poll for results
      pollForResults(documentId);

    } catch (err: any) {
      setError(`Upload failed: ${err.response?.data?.error || err.message}`);
      setUploading(false);
    }
  };

  const pollForResults = async (documentId: string) => {
    const maxAttempts = 60; // 5 minutes max
    let attempts = 0;

    const poll = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/results/${documentId}`);
        const data: ProcessingResult = response.data;

        setResult(data);

        if (data.status === 'complete') {
          setProcessing(false);
        } else if (data.status === 'error') {
          setError('Processing failed');
          setProcessing(false);
        } else if (attempts < maxAttempts) {
          attempts++;
          setTimeout(poll, 5000); // Poll every 5 seconds
        } else {
          setError('Processing timeout');
          setProcessing(false);
        }
      } catch (err: any) {
        if (attempts < maxAttempts) {
          attempts++;
          setTimeout(poll, 5000);
        } else {
          setError('Failed to get results');
          setProcessing(false);
        }
      }
    };

    poll();
  };

  const resetForm = () => {
    setSelectedFile(null);
    setResult(null);
    setError(null);
    setUploading(false);
    setProcessing(false);
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Intelligent Document Processing</h1>
        
        <div className="upload-section">
          <div className="file-input-container">
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.pdf"
              onChange={handleFileSelect}
              disabled={uploading || processing}
            />
            {selectedFile && (
              <p>Selected: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)</p>
            )}
          </div>

          <button
            onClick={uploadFile}
            disabled={!selectedFile || uploading || processing}
            className="upload-button"
          >
            {uploading ? 'Uploading...' : processing ? 'Processing...' : 'Upload & Process'}
          </button>

          {(uploading || processing) && (
            <div className="loading">
              <div className="spinner"></div>
              <p>{uploading ? 'Uploading document...' : 'Processing document (OCR → Classification → Summarization)...'}</p>
            </div>
          )}

          {error && (
            <div className="error">
              <p>{error}</p>
              <button onClick={resetForm}>Try Again</button>
            </div>
          )}
        </div>

        {result && (
          <div className="results-section">
            <h2>Processing Results</h2>
            
            <div className="result-card">
              <h3>Document Information</h3>
              <p><strong>File:</strong> {result.fileName}</p>
              <p><strong>Status:</strong> {result.status}</p>
              <p><strong>Uploaded:</strong> {new Date(result.uploadTimestamp).toLocaleString()}</p>
            </div>

            {result.ocrResults && (
              <div className="result-card">
                <h3>OCR Results (Key-Value Pairs)</h3>
                <div className="ocr-results">
                  {Object.entries(result.ocrResults).map(([key, value]) => (
                    <div key={key} className="ocr-item">
                      <strong>{key}:</strong> {value}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.classification && (
              <div className="result-card">
                <h3>Document Classification</h3>
                <p className="classification">{result.classification}</p>
              </div>
            )}

            {result.summary && (
              <div className="result-card">
                <h3>Document Summary</h3>
                <p className="summary">{result.summary}</p>
              </div>
            )}

            <button onClick={resetForm} className="reset-button">
              Process Another Document
            </button>
          </div>
        )}
      </header>
    </div>
  );
}

export default App;
