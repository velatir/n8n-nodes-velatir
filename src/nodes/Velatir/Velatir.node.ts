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
		description: 'Human approval gate - pauses workflow until approved by a human',
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
				displayName: 'Behavior Mode',
				name: 'behaviorMode',
				type: 'options',
				options: [
					{
						name: 'Wait for Approval (Fail if Denied)',
						value: 'approval_only',
						description: 'Traditional behavior: continue on approval, fail on decline/change request',
					},
					{
						name: 'Route Based on Decision',
						value: 'route_decision',
						description: 'Route to different outputs based on approval decision',
					},
				],
				default: 'approval_only',
				description: 'How the node should behave based on the approval decision',
			},
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
		const behaviorMode = this.getNodeParameter('behaviorMode', 0) as string;
		const functionName = this.getNodeParameter('functionName', 0) as string;
		const description = this.getNodeParameter('description', 0) as string;
		const pollingInterval = this.getNodeParameter('pollingInterval', 0) as number;
		const timeoutMinutes = this.getNodeParameter('timeoutMinutes', 0) as number;
		const llmExplanation = this.getNodeParameter('llmExplanation', 0) as string;

		// Initialize return data arrays for different output modes
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
						behaviorMode: behaviorMode,
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

				// If already approved, handle based on behavior mode
				if (initialState === 'approved') {
					const outputData = {
						json: {
							...inputData,
							_velatir: {
								reviewTaskId,
								state: 'approved',
								behaviorMode,
							}
						},
						pairedItem: { item: i },
					};

					if (behaviorMode === 'route_decision') {
						approvedData.push(outputData);
					} else {
						approvedData.push(outputData);
					}
					continue;
				}

				// If declined in approval_only mode, throw error
				if (initialState === 'declined' && behaviorMode === 'approval_only') {
					throw new NodeOperationError(
						this.getNode(),
						`Request was declined by Velatir approver (reviewTaskId: ${reviewTaskId})`,
						{ itemIndex: i }
					);
				}

				// If declined in route_decision mode, add to declined output
				if (initialState === 'declined' && behaviorMode === 'route_decision') {
					declinedData.push({
						json: {
							...inputData,
							_velatir: {
								reviewTaskId,
								state: 'declined',
								behaviorMode,
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

				// Handle final decision based on behavior mode
				const outputData = {
					json: {
						...inputData,
						_velatir: {
							reviewTaskId,
							state: finalState,
							requestedChange,
							behaviorMode,
						}
					},
					pairedItem: { item: i },
				};

				if (finalState === 'approved') {
					approvedData.push(outputData);
				} else if (finalState === 'declined') {
					if (behaviorMode === 'approval_only') {
						throw new NodeOperationError(
							this.getNode(),
							`Request was declined by Velatir (reason: ${requestedChange || 'No reason provided'}, reviewTaskId: ${reviewTaskId})`,
							{ itemIndex: i }
						);
					} else {
						declinedData.push(outputData);
					}
				} else if (finalState === 'change_requested') {
					if (behaviorMode === 'approval_only') {
						throw new NodeOperationError(
							this.getNode(),
							`Changes requested by Velatir (reason: ${requestedChange || 'No reason provided'}, reviewTaskId: ${reviewTaskId})`,
							{ itemIndex: i }
						);
					} else {
						changeRequestedData.push(outputData);
					}
				} else {
					throw new NodeOperationError(
						this.getNode(),
						`Unexpected state: ${finalState} (reviewTaskId: ${reviewTaskId})`,
						{ itemIndex: i }
					);
				}

			} catch (error) {
				if (this.continueOnFail()) {
					const errorData = {
						json: { 
							error: error instanceof Error ? error.message : 'Unknown error',
							_velatir: {
								state: 'error',
								behaviorMode,
							}
						},
						pairedItem: { item: i },
					};
					
					// Add error to appropriate output in route_decision mode
					if (behaviorMode === 'route_decision') {
						declinedData.push(errorData);
					} else {
						approvedData.push(errorData);
					}
					continue;
				}
				throw error;
			}
		}

		// Return data based on behavior mode
		if (behaviorMode === 'route_decision') {
			return [approvedData, declinedData, changeRequestedData];
		} else {
			// In approval_only mode, only return approved data through first output
			// Other outputs will be empty
			return [approvedData, [], []];
		}
	}
}