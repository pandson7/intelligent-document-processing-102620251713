import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import { Construct } from 'constructs';

export class IdpStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const suffix = '102620251713';

    // S3 Bucket for document storage
    const documentBucket = new s3.Bucket(this, `DocumentBucket${suffix}`, {
      bucketName: `idp-documents-${suffix}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      cors: [{
        allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.POST, s3.HttpMethods.PUT],
        allowedOrigins: ['*'],
        allowedHeaders: ['*'],
      }],
    });

    // DynamoDB table for processing results
    const resultsTable = new dynamodb.Table(this, `ResultsTable${suffix}`, {
      tableName: `idp-processing-results-${suffix}`,
      partitionKey: { name: 'documentId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 5,
      writeCapacity: 5,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
    });

    // Enable auto scaling
    resultsTable.autoScaleReadCapacity({
      minCapacity: 1,
      maxCapacity: 10,
    });
    resultsTable.autoScaleWriteCapacity({
      minCapacity: 1,
      maxCapacity: 10,
    });

    // IAM role for Lambda functions
    const lambdaRole = new iam.Role(this, `LambdaRole${suffix}`, {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
      inlinePolicies: {
        S3Access: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
              resources: [documentBucket.arnForObjects('*')],
            }),
          ],
        }),
        DynamoDBAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['dynamodb:PutItem', 'dynamodb:GetItem', 'dynamodb:UpdateItem', 'dynamodb:Query'],
              resources: [resultsTable.tableArn],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'dynamodb:DescribeStream',
                'dynamodb:GetRecords',
                'dynamodb:GetShardIterator',
                'dynamodb:ListStreams'
              ],
              resources: [resultsTable.tableStreamArn!],
            }),
          ],
        }),
        TextractAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['textract:AnalyzeDocument', 'textract:DetectDocumentText'],
              resources: ['*'],
            }),
          ],
        }),
        BedrockAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['bedrock:InvokeModel'],
              resources: [
                'arn:aws:bedrock:*:*:inference-profile/global.anthropic.claude-sonnet-4-20250514-v1:0',
                'arn:aws:bedrock:*::foundation-model/anthropic.claude-sonnet-4-20250514-v1:0'
              ],
            }),
          ],
        }),
      },
    });

    // Upload Handler Lambda
    const uploadHandler = new lambda.Function(this, `UploadHandler${suffix}`, {
      functionName: `idp-upload-handler-${suffix}`,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3 = new S3Client({});
const dynamodb = new DynamoDBClient({});

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers };
  }

  try {
    const body = JSON.parse(event.body);
    const { fileName, fileType } = body;
    
    if (!['image/jpeg', 'image/png', 'application/pdf'].includes(fileType)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Unsupported file type' })
      };
    }

    const documentId = Date.now().toString();
    const key = \`documents/\${documentId}-\${fileName}\`;

    // Generate presigned URL for upload
    const command = new PutObjectCommand({
      Bucket: '${documentBucket.bucketName}',
      Key: key,
      ContentType: fileType
    });
    
    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });

    // Create initial DynamoDB record
    await dynamodb.send(new PutItemCommand({
      TableName: '${resultsTable.tableName}',
      Item: {
        documentId: { S: documentId },
        fileName: { S: fileName },
        fileType: { S: fileType },
        s3Key: { S: key },
        status: { S: 'uploaded' },
        uploadTimestamp: { S: new Date().toISOString() },
        lastUpdated: { S: new Date().toISOString() }
      }
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ documentId, uploadUrl })
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
      `),
      role: lambdaRole,
      environment: {
        BUCKET_NAME: documentBucket.bucketName,
        TABLE_NAME: resultsTable.tableName,
      },
    });

    // OCR Processor Lambda
    const ocrProcessor = new lambda.Function(this, `OcrProcessor${suffix}`, {
      functionName: `idp-ocr-processor-${suffix}`,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      timeout: cdk.Duration.minutes(5),
      memorySize: 1024,
      code: lambda.Code.fromInline(`
const { TextractClient, AnalyzeDocumentCommand } = require('@aws-sdk/client-textract');
const { DynamoDBClient, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');

const textract = new TextractClient({});
const dynamodb = new DynamoDBClient({});

exports.handler = async (event) => {
  try {
    for (const record of event.Records) {
      const bucket = record.s3.bucket.name;
      const key = decodeURIComponent(record.s3.object.key.replace(/\\+/g, ' '));
      
      // Extract document ID from key
      const documentId = key.split('/')[1].split('-')[0];

      console.log(\`Processing OCR for document: \${documentId}\`);

      // Call Textract
      const command = new AnalyzeDocumentCommand({
        Document: {
          S3Object: {
            Bucket: bucket,
            Name: key
          }
        },
        FeatureTypes: ['FORMS', 'TABLES']
      });

      const response = await textract.send(command);
      
      // Extract key-value pairs
      const keyValuePairs = {};
      const blocks = response.Blocks || [];
      
      // Find key-value relationships
      const keyBlocks = blocks.filter(block => block.BlockType === 'KEY_VALUE_SET' && block.EntityTypes?.includes('KEY'));
      const valueBlocks = blocks.filter(block => block.BlockType === 'KEY_VALUE_SET' && block.EntityTypes?.includes('VALUE'));
      
      keyBlocks.forEach(keyBlock => {
        const keyText = extractText(keyBlock, blocks);
        const valueBlock = valueBlocks.find(vb => 
          keyBlock.Relationships?.some(rel => 
            rel.Type === 'VALUE' && rel.Ids?.includes(vb.Id)
          )
        );
        
        if (valueBlock) {
          const valueText = extractText(valueBlock, blocks);
          keyValuePairs[keyText] = valueText;
        }
      });

      // Also extract all text for classification
      const allText = blocks
        .filter(block => block.BlockType === 'LINE')
        .map(block => block.Text)
        .join(' ');

      // Update DynamoDB
      await dynamodb.send(new UpdateItemCommand({
        TableName: '${resultsTable.tableName}',
        Key: { documentId: { S: documentId } },
        UpdateExpression: 'SET ocrResults = :ocr, extractedText = :text, #status = :status, lastUpdated = :updated',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':ocr': { S: JSON.stringify(keyValuePairs) },
          ':text': { S: allText },
          ':status': { S: 'ocr-complete' },
          ':updated': { S: new Date().toISOString() }
        }
      }));

      console.log(\`OCR completed for document: \${documentId}\`);
    }
  } catch (error) {
    console.error('OCR processing error:', error);
    throw error;
  }
};

function extractText(block, allBlocks) {
  if (!block.Relationships) return '';
  
  const childIds = block.Relationships
    .filter(rel => rel.Type === 'CHILD')
    .flatMap(rel => rel.Ids || []);
    
  return childIds
    .map(id => allBlocks.find(b => b.Id === id))
    .filter(b => b && b.BlockType === 'WORD')
    .map(b => b.Text)
    .join(' ');
}
      `),
      role: lambdaRole,
      environment: {
        TABLE_NAME: resultsTable.tableName,
      },
    });

    // Classification Processor Lambda
    const classificationProcessor = new lambda.Function(this, `ClassificationProcessor${suffix}`, {
      functionName: `idp-classification-processor-${suffix}`,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      timeout: cdk.Duration.minutes(5),
      memorySize: 1024,
      code: lambda.Code.fromInline(`
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const { DynamoDBClient, UpdateItemCommand, GetItemCommand } = require('@aws-sdk/client-dynamodb');

const bedrock = new BedrockRuntimeClient({});
const dynamodb = new DynamoDBClient({});

const categories = [
  'Dietary Supplement', 'Stationery', 'Kitchen Supplies', 
  'Medicine', 'Driver License', 'Invoice', 'W2', 'Other'
];

exports.handler = async (event) => {
  try {
    for (const record of event.Records) {
      if (record.eventName === 'MODIFY') {
        const documentId = record.dynamodb.Keys.documentId.S;
        const newStatus = record.dynamodb.NewImage?.status?.S;
        
        if (newStatus === 'ocr-complete') {
          console.log(\`Starting classification for document: \${documentId}\`);
          
          // Get the extracted text
          const getResponse = await dynamodb.send(new GetItemCommand({
            TableName: '${resultsTable.tableName}',
            Key: { documentId: { S: documentId } }
          }));
          
          const extractedText = getResponse.Item?.extractedText?.S || '';
          
          // Classify using Bedrock
          const prompt = \`Classify this document into one of these categories: \${categories.join(', ')}. 
Document content: \${extractedText.substring(0, 2000)}
Return only the category name.\`;

          const command = new InvokeModelCommand({
            modelId: 'global.anthropic.claude-sonnet-4-20250514-v1:0',
            body: JSON.stringify({
              anthropic_version: 'bedrock-2023-05-31',
              max_tokens: 50,
              messages: [{
                role: 'user',
                content: prompt
              }]
            })
          });

          const response = await bedrock.send(command);
          const responseBody = JSON.parse(new TextDecoder().decode(response.body));
          let classification = responseBody.content[0].text.trim();
          
          // Validate classification
          if (!categories.includes(classification)) {
            classification = 'Other';
          }

          // Update DynamoDB
          await dynamodb.send(new UpdateItemCommand({
            TableName: '${resultsTable.tableName}',
            Key: { documentId: { S: documentId } },
            UpdateExpression: 'SET classification = :class, #status = :status, lastUpdated = :updated',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
              ':class': { S: classification },
              ':status': { S: 'classified' },
              ':updated': { S: new Date().toISOString() }
            }
          }));

          console.log(\`Classification completed for document: \${documentId} - \${classification}\`);
        }
      }
    }
  } catch (error) {
    console.error('Classification processing error:', error);
    throw error;
  }
};
      `),
      role: lambdaRole,
      environment: {
        TABLE_NAME: resultsTable.tableName,
      },
    });

    // Summarization Processor Lambda
    const summarizationProcessor = new lambda.Function(this, `SummarizationProcessor${suffix}`, {
      functionName: `idp-summarization-processor-${suffix}`,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      timeout: cdk.Duration.minutes(5),
      memorySize: 1024,
      code: lambda.Code.fromInline(`
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const { DynamoDBClient, UpdateItemCommand, GetItemCommand } = require('@aws-sdk/client-dynamodb');

const bedrock = new BedrockRuntimeClient({});
const dynamodb = new DynamoDBClient({});

exports.handler = async (event) => {
  try {
    for (const record of event.Records) {
      if (record.eventName === 'MODIFY') {
        const documentId = record.dynamodb.Keys.documentId.S;
        const newStatus = record.dynamodb.NewImage?.status?.S;
        
        if (newStatus === 'classified') {
          console.log(\`Starting summarization for document: \${documentId}\`);
          
          // Get the extracted text
          const getResponse = await dynamodb.send(new GetItemCommand({
            TableName: '${resultsTable.tableName}',
            Key: { documentId: { S: documentId } }
          }));
          
          const extractedText = getResponse.Item?.extractedText?.S || '';
          
          // Summarize using Bedrock
          const prompt = \`Create a concise summary of this document in 2-3 sentences:
\${extractedText.substring(0, 3000)}\`;

          const command = new InvokeModelCommand({
            modelId: 'global.anthropic.claude-sonnet-4-20250514-v1:0',
            body: JSON.stringify({
              anthropic_version: 'bedrock-2023-05-31',
              max_tokens: 200,
              messages: [{
                role: 'user',
                content: prompt
              }]
            })
          });

          const response = await bedrock.send(command);
          const responseBody = JSON.parse(new TextDecoder().decode(response.body));
          const summary = responseBody.content[0].text.trim();

          // Update DynamoDB with final results
          await dynamodb.send(new UpdateItemCommand({
            TableName: '${resultsTable.tableName}',
            Key: { documentId: { S: documentId } },
            UpdateExpression: 'SET summary = :summary, #status = :status, lastUpdated = :updated',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
              ':summary': { S: summary },
              ':status': { S: 'complete' },
              ':updated': { S: new Date().toISOString() }
            }
          }));

          console.log(\`Summarization completed for document: \${documentId}\`);
        }
      }
    }
  } catch (error) {
    console.error('Summarization processing error:', error);
    throw error;
  }
};
      `),
      role: lambdaRole,
      environment: {
        TABLE_NAME: resultsTable.tableName,
      },
    });

    // Results Handler Lambda
    const resultsHandler = new lambda.Function(this, `ResultsHandler${suffix}`, {
      functionName: `idp-results-handler-${suffix}`,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
const { DynamoDBClient, GetItemCommand } = require('@aws-sdk/client-dynamodb');

const dynamodb = new DynamoDBClient({});

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers };
  }

  try {
    const documentId = event.pathParameters.documentId;

    const response = await dynamodb.send(new GetItemCommand({
      TableName: '${resultsTable.tableName}',
      Key: { documentId: { S: documentId } }
    }));

    if (!response.Item) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Document not found' })
      };
    }

    const item = response.Item;
    const result = {
      documentId: item.documentId.S,
      fileName: item.fileName.S,
      fileType: item.fileType.S,
      status: item.status.S,
      uploadTimestamp: item.uploadTimestamp.S,
      lastUpdated: item.lastUpdated.S,
      ocrResults: item.ocrResults ? JSON.parse(item.ocrResults.S) : null,
      classification: item.classification?.S || null,
      summary: item.summary?.S || null
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result)
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
      `),
      role: lambdaRole,
      environment: {
        TABLE_NAME: resultsTable.tableName,
      },
    });

    // S3 event notification to trigger OCR
    documentBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(ocrProcessor),
      { prefix: 'documents/' }
    );

    // DynamoDB stream to trigger classification and summarization
    const eventSourceMapping1 = new lambda.EventSourceMapping(this, `ClassificationTrigger${suffix}`, {
      target: classificationProcessor,
      eventSourceArn: resultsTable.tableStreamArn!,
      startingPosition: lambda.StartingPosition.LATEST,
      batchSize: 1,
    });

    const eventSourceMapping2 = new lambda.EventSourceMapping(this, `SummarizationTrigger${suffix}`, {
      target: summarizationProcessor,
      eventSourceArn: resultsTable.tableStreamArn!,
      startingPosition: lambda.StartingPosition.LATEST,
      batchSize: 1,
    });

    // API Gateway
    const api = new apigateway.RestApi(this, `IdpApi${suffix}`, {
      restApiName: `idp-api-${suffix}`,
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key'],
      },
    });

    // Upload endpoint
    const uploadIntegration = new apigateway.LambdaIntegration(uploadHandler);
    api.root.addResource('upload').addMethod('POST', uploadIntegration);

    // Results endpoint
    const resultsIntegration = new apigateway.LambdaIntegration(resultsHandler);
    const resultsResource = api.root.addResource('results');
    resultsResource.addResource('{documentId}').addMethod('GET', resultsIntegration);

    // Outputs
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'API Gateway URL',
    });

    new cdk.CfnOutput(this, 'BucketName', {
      value: documentBucket.bucketName,
      description: 'S3 Bucket Name',
    });
  }
}
