# Intelligent Document Processing (IDP) System

A comprehensive serverless application for automated document analysis using AWS services. The system provides OCR text extraction, document classification, and intelligent summarization through a modern React web interface.

## 🚀 Features

- **Document Upload**: Drag-and-drop interface supporting JPEG, PNG, and PDF files
- **OCR Processing**: Extract text and key-value pairs using Amazon Textract
- **AI Classification**: Categorize documents into 8 predefined types using Amazon Bedrock
- **Intelligent Summarization**: Generate concise summaries with Claude 3 AI models
- **Real-time Results**: View processing results with live status updates
- **Persistent Storage**: Secure data storage with DynamoDB and S3

## 📋 Supported Document Categories

- Dietary Supplement
- Stationery  
- Kitchen Supplies
- Medicine
- Driver License
- Invoice
- W2 Tax Forms
- Other

## 🏗️ Architecture

### High-Level Architecture
```
[React Frontend] → [API Gateway] → [Lambda Functions] → [AWS Services]
                                                      ↓
[S3 Bucket] ← [DynamoDB] ← [Amazon Textract] ← [Amazon Bedrock]
```

### AWS Services Used
- **Amazon S3**: Document storage
- **Amazon DynamoDB**: Results and metadata storage
- **AWS Lambda**: Serverless processing functions
- **Amazon API Gateway**: REST API endpoints
- **Amazon Textract**: OCR text extraction
- **Amazon Bedrock**: AI classification and summarization
- **Amazon CloudWatch**: Monitoring and logging

### Lambda Functions
1. `upload-handler` - Handles document uploads and validation
2. `ocr-processor` - Extracts text using Amazon Textract
3. `classification-processor` - Classifies documents using AI
4. `summarization-processor` - Generates document summaries
5. `results-handler` - Retrieves processing results

## 🛠️ Technology Stack

### Frontend
- **React.js** - Modern UI framework
- **TypeScript** - Type-safe JavaScript
- **Axios** - HTTP client for API calls
- **Tailwind CSS** - Utility-first CSS framework

### Backend
- **AWS CDK** - Infrastructure as Code (TypeScript)
- **Node.js 18.x** - Lambda runtime
- **AWS SDK v3** - AWS service integration

## 📁 Project Structure

```
intelligent-document-processing/
├── README.md                    # This file
├── cdk-app/                     # AWS CDK Infrastructure
│   ├── lib/
│   │   ├── idp-stack.ts        # Main CDK stack definition
│   │   └── cdk-app-stack.ts    # App configuration
│   ├── bin/
│   │   └── cdk-app.ts          # CDK app entry point
│   ├── test/                   # CDK unit tests
│   ├── package.json            # CDK dependencies
│   └── cdk.json               # CDK configuration
├── frontend/                   # React Web Application
│   ├── src/
│   │   ├── App.tsx            # Main React component
│   │   ├── index.tsx          # React entry point
│   │   └── App.css            # Application styles
│   ├── public/                # Static assets
│   ├── package.json           # Frontend dependencies
│   └── tsconfig.json          # TypeScript configuration
├── specs/                     # Technical Documentation
│   ├── requirements.md        # Functional requirements
│   ├── design.md             # Technical architecture
│   └── tasks.md              # Implementation tasks
├── generated-diagrams/        # Architecture Diagrams
│   ├── high_level_architecture.png
│   ├── data_flow_pipeline.png
│   └── aws_services_integration.png
└── jira-stories-summary.md    # Project management documentation
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18.x or later
- AWS CLI configured with appropriate permissions
- AWS CDK CLI installed (`npm install -g aws-cdk`)

### 1. Deploy Infrastructure

```bash
cd cdk-app
npm install
npm run build
cdk bootstrap  # First time only
cdk deploy
```

### 2. Start Frontend Development Server

```bash
cd frontend
npm install
npm start
```

The application will be available at `http://localhost:3000`

### 3. Upload and Process Documents

1. Open the web application
2. Drag and drop a document (JPEG, PNG, or PDF)
3. Wait for processing to complete
4. View extracted text, classification, and summary

## 🔧 Configuration

### Environment Variables

The CDK stack automatically configures the following:

- `API_ENDPOINT` - API Gateway endpoint URL
- `S3_BUCKET` - Document storage bucket name
- `DYNAMODB_TABLE` - Results table name
- `BEDROCK_REGION` - Amazon Bedrock service region

### AWS Permissions Required

The deployment requires the following AWS permissions:
- S3: Create buckets, upload/download objects
- DynamoDB: Create tables, read/write items
- Lambda: Create functions, manage execution roles
- API Gateway: Create APIs, manage deployments
- Textract: Analyze documents
- Bedrock: Invoke AI models
- CloudWatch: Create log groups, write logs

## 📊 Monitoring and Logging

### CloudWatch Dashboards
- Lambda function metrics (duration, errors, invocations)
- API Gateway request/response metrics
- DynamoDB read/write capacity metrics

### Log Groups
- `/aws/lambda/upload-handler`
- `/aws/lambda/ocr-processor`
- `/aws/lambda/classification-processor`
- `/aws/lambda/summarization-processor`
- `/aws/lambda/results-handler`

## 🔒 Security Features

- **Encryption at Rest**: S3 and DynamoDB encryption enabled
- **IAM Roles**: Least privilege access for Lambda functions
- **CORS Configuration**: Secure cross-origin requests
- **Input Validation**: File type and size validation
- **Error Handling**: Secure error messages without sensitive data

## 💰 Cost Optimization

### Estimated Monthly Costs (100 documents/month)
- **Lambda**: ~$1-2 (based on execution time)
- **S3**: ~$0.50 (storage and requests)
- **DynamoDB**: ~$1-2 (on-demand pricing)
- **Textract**: ~$5-10 (per document processed)
- **Bedrock**: ~$2-5 (AI model usage)
- **API Gateway**: ~$0.50 (API calls)

**Total Estimated**: $10-20/month for moderate usage

### Cost Optimization Features
- On-demand DynamoDB pricing
- S3 lifecycle policies for document cleanup
- Right-sized Lambda memory allocation
- Efficient AI model selection (Haiku for classification, Sonnet for summarization)

## 🧪 Testing

### CDK Unit Tests
```bash
cd cdk-app
npm test
```

### Frontend Tests
```bash
cd frontend
npm test
```

### Integration Testing
1. Deploy to development environment
2. Upload test documents of each supported format
3. Verify end-to-end processing pipeline
4. Check results accuracy and completeness

## 🚀 Deployment

### Development Environment
```bash
cdk deploy --context environment=dev
```

### Production Environment
```bash
cdk deploy --context environment=prod
```

### CI/CD Pipeline
The project includes GitHub Actions workflows for:
- Automated testing on pull requests
- Infrastructure deployment on merge to main
- Frontend deployment to S3/CloudFront

## 📈 Performance Metrics

### Target Performance
- **Upload Response**: < 2 seconds
- **OCR Processing**: < 30 seconds
- **Classification**: < 5 seconds
- **Summarization**: < 10 seconds
- **Total End-to-End**: < 45 seconds

### Scalability
- **Concurrent Users**: 100+ (API Gateway limits)
- **Documents/Hour**: 1000+ (Lambda concurrency)
- **Storage**: Unlimited (S3)
- **Database**: Auto-scaling (DynamoDB on-demand)

## 🐛 Troubleshooting

### Common Issues

1. **Upload Fails**
   - Check file format (JPEG, PNG, PDF only)
   - Verify file size < 10MB
   - Check AWS credentials and permissions

2. **Processing Timeout**
   - Large files may take longer to process
   - Check CloudWatch logs for specific errors
   - Verify Textract and Bedrock service availability

3. **Results Not Displaying**
   - Check browser console for JavaScript errors
   - Verify API Gateway endpoint configuration
   - Check DynamoDB table permissions

### Debug Commands
```bash
# Check CDK stack status
cdk list
cdk diff

# View CloudWatch logs
aws logs describe-log-groups --log-group-name-prefix "/aws/lambda/"

# Check DynamoDB table
aws dynamodb scan --table-name idp-processing-results
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines
- Follow TypeScript best practices
- Add unit tests for new features
- Update documentation for API changes
- Use conventional commit messages

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- AWS for providing comprehensive cloud services
- Amazon Bedrock team for Claude AI models
- React community for excellent documentation
- AWS CDK team for Infrastructure as Code capabilities

## 📞 Support

For questions and support:
- Create an issue in the GitHub repository
- Check the [AWS Documentation](https://docs.aws.amazon.com/)
- Review CloudWatch logs for debugging information

---

**Built with ❤️ using AWS Serverless Technologies**
