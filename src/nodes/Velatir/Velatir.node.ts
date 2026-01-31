import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
	NodeOperationError,
	NodeConnectionType,
} from 'n8n-workflow';

export class Velatir implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Velatir',
		name: 'velatir',
		icon: 'file:velatir.svg',
		group: ['transform'],
		version: 2,
		subtitle: 'Send and Wait for Response',
		description: 'AI compliance and approval workflows',
		defaults: {
			name: 'Velatir',
		},
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
		credentials: [
			{
				name: 'velatirApi',
				required: true,
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				responseData: '',
				path: '={{ $nodeId }}',
				restartWebhook: true,
				isFullPath: true,
			},
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Send and Wait for Response',
						value: 'sendAndWait',
						action: 'Send trace and wait for response',
						description: 'Create a trace for assessment and wait for the result',
					},
				],
				default: 'sendAndWait',
			},
			{
				displayName: 'Tool Calls',
				name: 'toolCalls',
				type: 'string',
				default: '',
				description: 'Comma-separated list of tool names being called',
				placeholder: 'gmail_send, hubspot_update_contact',
			},
			{
				displayName: 'Arguments',
				name: 'args',
				type: 'json',
				default: '={{ $json }}',
				description: 'Data to assess (JSON object)',
			},
			{
				displayName: 'Session ID',
				name: 'sessionId',
				type: 'string',
				default: '',
				description: 'ID to group related traces together. Defaults to n8n execution ID if not provided.',
				placeholder: 'session_abc123',
			},
			{
				displayName: 'Direction',
				name: 'direction',
				type: 'options',
				options: [
					{
						name: 'Inlet',
						value: 'inlet',
						description: 'Incoming request/data',
					},
					{
						name: 'Response',
						value: 'response',
						description: 'Outgoing response',
					},
					{
						name: 'Signal',
						value: 'signal',
						description: 'Internal signal/event',
					},
				],
				default: 'inlet',
				description: 'Direction of the trace',
			},
			{
				displayName: 'Title',
				name: 'title',
				type: 'string',
				default: '',
				description: 'Custom title for the trace',
				placeholder: 'Customer onboarding approval',
			},
			{
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				options: [
					{
						displayName: 'Metadata',
						name: 'metadata',
						type: 'json',
						default: '{}',
						description: 'Additional metadata to include',
					},
					{
						displayName: 'Timeout (Minutes)',
						name: 'timeoutMinutes',
						type: 'number',
						default: 20160,
						description: 'Maximum time to wait for response (default: 14 days)',
						typeOptions: {
							minValue: 1,
						},
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		let requiresWaiting = false;

		// Check if we're resuming from a webhook callback
		// When resuming, input data will have approved field from the webhook response
		const firstItem = items[0]?.json as Record<string, unknown> | undefined;
		if (firstItem?.approved !== undefined) {
			// This is a resume from webhook - just pass through the data
			return [items];
		}

		// Default timeout: 14 days
		let waitMillis = 14 * 24 * 60 * 60 * 1000;

		for (let i = 0; i < items.length; i++) {
			try {
				const credentials = await this.getCredentials('velatirApi');

				// Get parameters
				const toolCallsStr = this.getNodeParameter('toolCalls', i) as string;
				const args = this.getNodeParameter('args', i) as object;
				const sessionId = this.getNodeParameter('sessionId', i) as string;
				const direction = this.getNodeParameter('direction', i) as string;
				const title = this.getNodeParameter('title', i) as string;
				const additionalFields = this.getNodeParameter('additionalFields', i) as {
					metadata?: string;
					timeoutMinutes?: number;
				};

				// Parse tool calls from comma-separated string
				const toolCalls = toolCallsStr
					? toolCallsStr.split(',').map((s) => s.trim()).filter(Boolean)
					: undefined;

				// Parse user metadata
				let userMetadata: Record<string, unknown> = {};
				if (additionalFields.metadata) {
					try {
						userMetadata = typeof additionalFields.metadata === 'string'
							? JSON.parse(additionalFields.metadata)
							: additionalFields.metadata;
					} catch {
						// Ignore parse errors, use empty object
					}
				}

				// Build request body
				const requestBody: Record<string, unknown> = {
					functionName: this.getNode().name,
					args,
					metadata: {
						n8n: {
							workflowId: this.getWorkflow().id,
							executionId: this.getExecutionId(),
							nodeId: this.getNode().id,
							itemIndex: i,
						},
						...userMetadata,
					},
				};

				// Add optional fields only if provided
				if (toolCalls && toolCalls.length > 0) {
					requestBody.toolCalls = toolCalls;
				}

				// Use provided sessionId, or default to execution ID to group traces from same workflow run
				requestBody.sessionId = sessionId || this.getExecutionId();

				if (direction && direction !== 'inlet') {
					requestBody.direction = direction;
				}
				if (title) {
					requestBody.title = title;
				}

				// Add webhook URL for callback (used if human intervention needed)
				const resumeUrl = this.evaluateExpression('{{ $execution?.resumeUrl }}', i) as string;
				const nodeId = this.evaluateExpression('{{ $nodeId }}', i) as string;
				requestBody.webhookUrl = `${resumeUrl}/${nodeId}`;

				// Set timeout from additional fields
				if (additionalFields.timeoutMinutes) {
					waitMillis = additionalFields.timeoutMinutes * 60 * 1000;
				}

				// Create the trace
				const response = await this.helpers.httpRequest({
					method: 'POST',
					url: `${credentials.domain}/api/v1/trace`,
					body: requestBody,
					json: true,
					headers: {
						'X-API-Key': credentials.apiKey as string,
						'Accept': 'application/json',
						'Content-Type': 'application/json',
					},
				});

				// Validate response
				if (!response || !response.traceId) {
					throw new NodeOperationError(
						this.getNode(),
						`Invalid API response: ${JSON.stringify(response)}`,
						{ itemIndex: i }
					);
				}

				const { traceId, status, processedAsync, reviewTaskId } = response;
				const normalizedStatus = status?.toLowerCase();

				// Case 1: No workflows configured - queued for async assessment, proceed immediately
				if (processedAsync === true) {
					returnData.push({
						json: {
							approved: true,
							state: 'approved',
							traceId,
							processedAsync: true,
						},
						pairedItem: { item: i },
					});
					continue;
				}

				// Case 2: Completed - approved by workflow
				if (normalizedStatus === 'completed') {
					returnData.push({
						json: {
							approved: true,
							state: 'approved',
							traceId,
						},
						pairedItem: { item: i },
					});
					continue;
				}

				// Case 3: Rejected - blocked by workflow
				if (normalizedStatus === 'rejected') {
					throw new NodeOperationError(
						this.getNode(),
						'Request was rejected by policy',
						{ itemIndex: i }
					);
				}

				// Case 4: Assessed with reviewTaskId - requires human intervention, wait for webhook
				if (normalizedStatus === 'assessed' && reviewTaskId) {
					requiresWaiting = true;
					returnData.push({
						json: {
							state: 'pending',
							traceId,
							reviewTaskId,
						},
						pairedItem: { item: i },
					});
					continue;
				}

				// Fallback: Unknown state, treat as needing to wait if reviewTaskId present
				if (reviewTaskId) {
					requiresWaiting = true;
				}
				const fallbackApproved = !reviewTaskId;
				returnData.push({
					json: {
						approved: fallbackApproved,
						state: reviewTaskId ? 'pending' : 'approved',
						traceId,
						reviewTaskId,
					},
					pairedItem: { item: i },
				});

			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							approved: false,
							state: 'error',
							error: error instanceof Error ? error.message : 'Unknown error',
						},
						pairedItem: { item: i },
					});
					continue;
				}
				throw error;
			}
		}

		// If any item requires waiting for human intervention, pause execution
		if (requiresWaiting) {
			const waitTill = new Date(Date.now() + waitMillis);
			await this.putExecutionToWait(waitTill);
			return [this.getInputData()];
		}

		// All items resolved immediately, return results
		return [returnData];
	}

	webhook = async function (this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const bodyData = this.getBodyData() as {
			state?: string;
			traceId?: string;
			reviewTaskId?: string;
			requestedChange?: string;
		};

		const state = bodyData.state?.toLowerCase() || 'approved';
		// approved = true only for "approved" state
		// changerequested and rejected both mean not approved
		const approved = state === 'approved';

		return {
			workflowData: [this.helpers.returnJsonArray({
				approved,
				state,
				traceId: bodyData.traceId,
				reviewTaskId: bodyData.reviewTaskId,
				requestedChange: bodyData.requestedChange,
			})],
		};
	};
}
