# Technical Design Document

## Introduction

This document outlines the technical architecture for the Intelligent Document Processing (IDP) application. The system uses AWS services to provide a scalable, serverless solution for document processing with OCR, classification, and summarization capabilities.

## System Architecture

### High-Level Architecture

The IDP application follows a serverless, event-driven architecture:

```
[React Frontend] → [API Gateway] → [Lambda Functions] → [AWS Services]
                                                      ↓
[S3 Bucket] ← [DynamoDB] ← [Amazon Textract] ← [Amazon Bedrock]
```

### Component Overview

1. **Frontend**: React-based web application for document upload and results display
2. **API Layer**: AWS API Gateway for REST endpoints
3. **Processing Layer**: AWS Lambda functions for business logic
4. **Storage Layer**: Amazon S3 for document storage, DynamoDB for metadata and results
5. **AI Services**: Amazon Textract for OCR, Amazon Bedrock for classification and summarization

## Detailed Component Design

### Frontend Application

**Technology Stack:**
- React.js for UI components
- Axios for HTTP requests
- Local development server

**Key Components:**
- Document upload component with drag-and-drop interface
- Results display component showing OCR data, classification, and summary
- Loading states and error handling
- File format validation (JPEG, PNG, PDF)

### API Gateway

**Endpoints:**
- `POST /upload` - Document upload endpoint
- `GET /results/{documentId}` - Retrieve processing results
- `GET /status/{documentId}` - Check processing status

**Configuration:**
- CORS enabled for frontend access
- Request/response validation
- Error handling and logging

### Lambda Functions

#### 1. Upload Handler (`upload-handler`)
**Runtime:** Node.js 18.x
**Purpose:** Handle document uploads and initiate processing
**Triggers:** API Gateway POST /upload
**Actions:**
- Validate file format and size
- Generate unique document ID
- Upload file to S3
- Create initial DynamoDB record
- Trigger OCR processing

#### 2. OCR Processor (`ocr-processor`)
**Runtime:** Node.js 18.x
**Purpose:** Extract text and key-value pairs from documents
**Triggers:** S3 upload event
**Actions:**
- Call Amazon Textract for text extraction
- Format results as JSON key-value pairs
- Handle markdown-wrapped JSON
- Update DynamoDB with OCR results
- Trigger classification processing

#### 3. Classification Processor (`classification-processor`)
**Runtime:** Node.js 18.x
**Purpose:** Classify documents into predefined categories
**Triggers:** DynamoDB stream (OCR completion)
**Actions:**
- Use Amazon Bedrock for document classification
- Apply predefined categories: Dietary Supplement, Stationery, Kitchen Supplies, Medicine, Driver License, Invoice, W2, Other
- Update DynamoDB with classification results
- Trigger summarization processing

#### 4. Summarization Processor (`summarization-processor`)
**Runtime:** Node.js 18.x
**Purpose:** Generate document summaries
**Triggers:** DynamoDB stream (classification completion)
**Actions:**
- Use Amazon Bedrock for text summarization
- Generate concise, readable summaries
- Update DynamoDB with final results
- Mark processing as complete

#### 5. Results Handler (`results-handler`)
**Runtime:** Node.js 18.x
**Purpose:** Retrieve processing results for frontend
**Triggers:** API Gateway GET requests
**Actions:**
- Query DynamoDB for document results
- Format response for frontend consumption
- Handle status checks and error states

### Storage Design

#### Amazon S3 Bucket
**Purpose:** Store uploaded documents
**Configuration:**
- Bucket name: `idp-documents-{environment}`
- Versioning enabled
- Server-side encryption
- Lifecycle policies for cost optimization
- Event notifications to trigger processing

#### DynamoDB Table
**Table Name:** `idp-processing-results`
**Partition Key:** `documentId` (String)
**Attributes:**
- `documentId`: Unique identifier
- `fileName`: Original file name
- `fileType`: File format (JPEG, PNG, PDF)
- `uploadTimestamp`: Upload time
- `status`: Processing status (uploaded, ocr-complete, classified, summarized, complete, error)
- `ocrResults`: JSON object with extracted key-value pairs
- `classification`: Document category
- `summary`: Generated summary text
- `errorMessage`: Error details if processing fails
- `lastUpdated`: Last modification timestamp

**Global Secondary Indexes:**
- `status-index`: Query by processing status
- `uploadTimestamp-index`: Query by upload time

### AWS Services Integration

#### Amazon Textract
**Purpose:** OCR processing for text extraction
**Configuration:**
- Use `AnalyzeDocument` API with FORMS feature
- Extract key-value pairs and tables
- Handle multi-page PDFs
- Process JPEG and PNG images

#### Amazon Bedrock
**Purpose:** AI-powered classification and summarization
**Models:**
- Claude 3 Haiku for classification (cost-effective)
- Claude 3 Sonnet for summarization (higher quality)

**Classification Prompt:**
```
Classify this document into one of these categories: Dietary Supplement, Stationery, Kitchen Supplies, Medicine, Driver License, Invoice, W2, Other. 
Document content: {extracted_text}
Return only the category name.
```

**Summarization Prompt:**
```
Create a concise summary of this document in 2-3 sentences:
{extracted_text}
```

## Security Considerations

### Authentication and Authorization
- No authentication required for prototype
- API Gateway throttling to prevent abuse
- CORS configuration for frontend access

### Data Security
- S3 bucket encryption at rest
- DynamoDB encryption at rest
- Lambda environment variables for sensitive configuration
- IAM roles with least privilege access

### Input Validation
- File type validation (JPEG, PNG, PDF only)
- File size limits (max 10MB)
- Input sanitization for all API endpoints

## Performance and Scalability

### Lambda Configuration
- Memory: 512MB for upload/results handlers, 1024MB for processing functions
- Timeout: 30 seconds for API handlers, 5 minutes for processing functions
- Concurrent execution limits to manage costs

### DynamoDB Configuration
- On-demand billing mode for variable workloads
- Point-in-time recovery enabled
- DynamoDB Streams for event-driven processing

### Monitoring and Logging
- CloudWatch Logs for all Lambda functions
- CloudWatch Metrics for performance monitoring
- X-Ray tracing for request flow analysis

## Deployment Architecture

### Infrastructure as Code
- AWS CDK (TypeScript) for infrastructure deployment
- Separate stacks for different environments
- Automated deployment pipeline

### Environment Configuration
- Development: Single region, minimal resources
- Production: Multi-AZ deployment, enhanced monitoring

## Error Handling Strategy

### Retry Logic
- Exponential backoff for AWS service calls
- Dead letter queues for failed processing
- Manual retry capability through API

### Failure Recovery
- Processing status tracking in DynamoDB
- Ability to restart failed processing steps
- Comprehensive error logging and alerting

## Cost Optimization

### Resource Optimization
- Lambda functions sized appropriately
- DynamoDB on-demand pricing
- S3 lifecycle policies for document cleanup
- Bedrock model selection based on use case

### Monitoring and Alerts
- Cost monitoring dashboards
- Budget alerts for unexpected usage
- Resource utilization tracking
