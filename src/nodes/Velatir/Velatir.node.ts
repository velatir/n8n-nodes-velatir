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
				default: '={{$node.name}}',
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
		const functionName = this.getNodeParameter('functionName', 0) as string;
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

				// Create the review task request
				const createResponse = await this.helpers.httpRequest.call(this, {
					method: 'POST',
					url: `${credentials.domain}/api/v1/review-tasks`,
					body: requestBody,
					json: true,
					headers: {
						'X-API-Key': credentials.apiKey as string,
						'Accept': 'application/json',
						'Content-Type': 'application/json',
					},
				});

				// API returns data directly in response body
				if (!createResponse || !createResponse.reviewTaskId) {
					throw new NodeOperationError(
						this.getNode(),
						`Invalid API response: ${JSON.stringify(createResponse)}`,
						{ itemIndex: i }
					);
				}

				const reviewTaskId = createResponse.reviewTaskId;
				const initialState = createResponse.state;

				// If already approved, route to approved output
				if (initialState === 'approved') {
					approvedData.push({
						json: {
							...inputData,
							_velatir: {
								reviewTaskId,
								state: 'approved',
							}
						},
						pairedItem: { item: i },
					});
					continue;
				}

				// If declined, route to declined output
				if (initialState === 'declined') {
					declinedData.push({
						json: {
							...inputData,
							_velatir: {
								reviewTaskId,
								state: 'declined',
							}
						},
						pairedItem: { item: i },
					});
					continue;
				}

				// If change requested, route to change requested output
				if (initialState === 'change_requested') {
					changeRequestedData.push({
						json: {
							...inputData,
							_velatir: {
								reviewTaskId,
								state: 'change_requested',
								requestedChange: '',
							}
						},
						pairedItem: { item: i },
					});
					continue;
				}

				// Wait for approval (polling)
				let attempts = 0;
				let finalState = initialState;
				let requestedChange = "";

				while (finalState === 'pending') {
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

				// Handle final decision by routing to appropriate output
				if (finalState === 'approved') {
					approvedData.push({
						json: {
							...inputData,
							_velatir: {
								reviewTaskId,
								state: 'approved',
								requestedChange,
							}
						},
						pairedItem: { item: i },
					});
				} else if (finalState === 'declined') {
					declinedData.push({
						json: {
							...inputData,
							_velatir: {
								reviewTaskId,
								state: 'declined',
								requestedChange,
							}
						},
						pairedItem: { item: i },
					});
				} else if (finalState === 'change_requested') {
					changeRequestedData.push({
						json: {
							...inputData,
							_velatir: {
								reviewTaskId,
								state: 'change_requested',
								requestedChange,
							}
						},
						pairedItem: { item: i },
					});
				} else {
					throw new NodeOperationError(
						this.getNode(),
						`Unexpected state: ${finalState} (reviewTaskId: ${reviewTaskId})`,
						{ itemIndex: i }
					);
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