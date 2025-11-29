import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
	NodeConnectionType,
} from 'n8n-workflow';

// Utility function to create a delay without using setTimeout directly
function delay(ms: number): Promise<void> {
	return new Promise((resolve) => {
		const start = Date.now();
		const check = () => {
			if (Date.now() - start >= ms) {
				resolve();
			} else {
				// Use setImmediate for non-blocking polling
				setImmediate(check);
			}
		};
		check();
	});
}

export class Velatir implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Velatir',
		name: 'velatir',
		icon: 'file:velatir.svg',
		group: ['transform'],
		version: 1,
		description: 'Human approval gate with decision routing - routes workflow based on approval decision',
		defaults: {
			name: 'Velatir',
		},
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main, NodeConnectionType.Main, NodeConnectionType.Main],
		outputNames: ['Approved', 'Declined', 'Change Requested'],
		credentials: [
			{
				name: 'velatirApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Function Name',
				name: 'functionName',
				type: 'string',
				default: '',
				description: 'Name shown to approvers (defaults to node name)',
				placeholder: 'Send Email',
			},
			{
				displayName: 'Description',
				name: 'description',
				type: 'string',
				default: '',
				description: 'Description of what this step does',
				placeholder: 'Send welcome email to new customers',
			},
			{
				displayName: 'Polling Interval (Seconds)',
				name: 'pollingInterval',
				type: 'number',
				default: 5,
				description: 'How often to check for approval (seconds)',
				typeOptions: {
					minValue: 1,
					maxValue: 300,
				},
			},
			{
				displayName: 'Timeout (Minutes)',
				name: 'timeoutMinutes',
				type: 'number',
				default: 10,
				description: 'Maximum time to wait for approval (0 for unlimited)',
				typeOptions: {
					minValue: 0,
				},
			},
			{
				displayName: 'LLM Explanation',
				name: 'llmExplanation',
				type: 'string',
				default: '',
				description: 'Optional explanation from AI about why this approval is needed',
				placeholder: 'This action requires approval because...',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const functionName = (this.getNodeParameter('functionName', 0) as string) || this.getNode().name;
		const description = this.getNodeParameter('description', 0) as string;
		const pollingInterval = this.getNodeParameter('pollingInterval', 0) as number;
		const timeoutMinutes = this.getNodeParameter('timeoutMinutes', 0) as number;
		const llmExplanation = this.getNodeParameter('llmExplanation', 0) as string;

		// Initialize return data arrays for routing
		const approvedData: INodeExecutionData[] = [];
		const declinedData: INodeExecutionData[] = [];
		const changeRequestedData: INodeExecutionData[] = [];

		const maxAttempts = timeoutMinutes > 0 ? Math.ceil((timeoutMinutes * 60) / pollingInterval) : 0;

		for (let i = 0; i < items.length; i++) {
			try {
				const inputData = items[i].json;
				const credentials = await this.getCredentials('velatirApi');

				// Create review task request with input data as arguments
				const requestBody = {
					functionName: functionName || `Step ${i + 1}`,
					args: inputData,
					doc: description || `Approve data processing in n8n workflow`,
					llmExplanation: llmExplanation || undefined,
					metadata: {
						nodeType: 'n8n-velatir-gate',
						workflowId: this.getWorkflow().id,
						executionId: this.getExecutionId(),
						nodeId: this.getNode().id,
						itemIndex: i,
					},
				};

				// Create the trace request (new API)
				const traceResponse = await this.helpers.httpRequest.call(this, {
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

				// API returns: { traceId, status, processedAsync, reviewTaskId? }
				if (!traceResponse || !traceResponse.traceId) {
					throw new NodeOperationError(
						this.getNode(),
						`Invalid API response: ${JSON.stringify(traceResponse)}`,
						{ itemIndex: i }
					);
				}

				const traceId = traceResponse.traceId;
				const traceStatus = traceResponse.status;
				const reviewTaskId = traceResponse.reviewTaskId;
				const processedAsync = traceResponse.processedAsync;

				// Check trace status for immediate decisions
				const normalizedTraceStatus = traceStatus.toLowerCase();

				// If immediately approved (Completed status), route to approved output
				if (normalizedTraceStatus === 'completed') {
					approvedData.push({
						json: {
							...inputData,
							_velatir: {
								traceId,
								reviewTaskId,
								state: 'approved',
							}
						},
						pairedItem: { item: i },
					});
					continue;
				}

				// If immediately rejected, route to declined output
				if (normalizedTraceStatus === 'rejected') {
					declinedData.push({
						json: {
							...inputData,
							_velatir: {
								traceId,
								reviewTaskId,
								state: 'declined',
							}
						},
						pairedItem: { item: i },
					});
					continue;
				}

				// If async processing with no workflow (no reviewTaskId), treat as approved
				if (processedAsync && !reviewTaskId) {
					approvedData.push({
						json: {
							...inputData,
							_velatir: {
								traceId,
								state: 'approved',
								processedAsync: true,
							}
						},
						pairedItem: { item: i },
					});
					continue;
				}

				// If reviewTaskId is present, we need to poll for the human decision
				if (!reviewTaskId) {
					// No review task and no immediate decision - treat as error
					throw new NodeOperationError(
						this.getNode(),
						`Unexpected trace status '${traceStatus}' without reviewTaskId`,
						{ itemIndex: i }
					);
				}

				// Wait for approval by polling the review task status
				let attempts = 0;
				let finalState = 'pending';
				let requestedChange = "";

				// Continue polling while in non-final states
				while (['pending', 'processing', 'requiresintervention'].includes(finalState.toLowerCase())) {
					if (maxAttempts > 0 && attempts >= maxAttempts) {
						throw new NodeOperationError(
							this.getNode(),
							`Approval timeout after ${timeoutMinutes} minutes (reviewTaskId: ${reviewTaskId})`,
							{ itemIndex: i }
						);
					}

					// Wait before next poll
					await delay(pollingInterval * 1000);
					attempts++;

					// Check status
					const statusResponse = await this.helpers.httpRequest.call(this, {
						method: 'GET',
						url: `${credentials.domain}/api/v1/review-tasks/${reviewTaskId}`,
						json: true,
						headers: {
							'X-API-Key': credentials.apiKey as string,
							'Accept': 'application/json',
						},
					});

					finalState = statusResponse.state;
					requestedChange = statusResponse.requestedChange ?? "";
				}

				// Handle final decision by routing to appropriate output (case insensitive)
				const normalizedState = finalState.toLowerCase();
				if (normalizedState === 'approved') {
					approvedData.push({
						json: {
							...inputData,
							_velatir: {
								traceId,
								reviewTaskId,
								state: 'approved',
								requestedChange,
							}
						},
						pairedItem: { item: i },
					});
				} else if (normalizedState === 'rejected') {
					declinedData.push({
						json: {
							...inputData,
							_velatir: {
								traceId,
								reviewTaskId,
								state: 'declined',
								requestedChange,
							}
						},
						pairedItem: { item: i },
					});
				} else if (normalizedState === 'changerequested') {
					changeRequestedData.push({
						json: {
							...inputData,
							_velatir: {
								traceId,
								reviewTaskId,
								state: 'change_requested',
								requestedChange,
							}
						},
						pairedItem: { item: i },
					});
				} else {
					// Handle any other unexpected states by logging and routing to declined
					declinedData.push({
						json: {
							...inputData,
							error: `Unexpected approval state: ${finalState}`,
							_velatir: {
								traceId,
								reviewTaskId,
								state: finalState,
								requestedChange,
							}
						},
						pairedItem: { item: i },
					});
				}

			} catch (error) {
				if (this.continueOnFail()) {
					// Route errors to declined output
					declinedData.push({
						json: { 
							error: error instanceof Error ? error.message : 'Unknown error',
							_velatir: {
								state: 'error',
							}
						},
						pairedItem: { item: i },
					});
					continue;
				}
				throw error;
			}
		}

		// Always return all three outputs for routing
		return [approvedData, declinedData, changeRequestedData];
	}
}