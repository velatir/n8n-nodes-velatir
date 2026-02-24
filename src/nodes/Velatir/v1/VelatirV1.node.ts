import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	INodeTypeBaseDescription,
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

const versionDescription: INodeTypeDescription = {
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
	outputs: [NodeConnectionType.Main],
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
	],
};

export class VelatirV1 implements INodeType {
	description: INodeTypeDescription;

	constructor(baseDescription: INodeTypeBaseDescription) {
		this.description = {
			...baseDescription,
			...versionDescription,
		};
	}

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const functionName = this.getNodeParameter('functionName', 0) as string;
		const description = this.getNodeParameter('description', 0) as string;
		const pollingInterval = this.getNodeParameter('pollingInterval', 0) as number;
		const timeoutMinutes = this.getNodeParameter('timeoutMinutes', 0) as number;

		const maxAttempts = timeoutMinutes > 0 ? Math.ceil((timeoutMinutes * 60) / pollingInterval) : 0;

		for (let i = 0; i < items.length; i++) {
			try {
				const inputData = items[i].json;
				const credentials = await this.getCredentials('velatirApi');

				// Create watch request with input data as arguments
				const requestBody = {
					functionname: functionName || `Step ${i + 1}`,
					args: inputData,
					doc: description || `Approve data processing in n8n workflow`,
					metadata: {
						nodeType: 'n8n-velatir-gate',
						workflowId: this.getWorkflow().id,
						executionId: this.getExecutionId(),
						nodeId: this.getNode().id,
						itemIndex: i,
					},
				};

				// Create the watch request
				const createResponse = await this.helpers.httpRequest.call(this, {
					method: 'POST',
					url: `${credentials.domain}/api/v1/watches`,
					body: requestBody,
					json: true,
					headers: {
						'X-API-Key': credentials.apiKey as string,
						'Accept': 'application/json',
						'Content-Type': 'application/json',
					},
				});

				// API returns data directly in response body
				if (!createResponse || !createResponse.requestId) {
					throw new NodeOperationError(
						this.getNode(),
						`Invalid API response: ${JSON.stringify(createResponse)}`,
						{ itemIndex: i }
					);
				}

				const requestId = createResponse.requestId;
				const initialState = createResponse.state;

				// If already approved, return immediately
				if (initialState === 'approved') {
					returnData.push({
						json: inputData,
						pairedItem: { item: i },
					});
					continue;
				}

				// If denied, throw error
				if (initialState === 'denied') {
					throw new NodeOperationError(
						this.getNode(),
						`Request was denied by Velatir approver (request_id: ${requestId})`,
						{ itemIndex: i }
					);
				}

				// Wait for approval (polling)
				let attempts = 0;
				let finalState = initialState;
				let reason = "";

				while (finalState === 'pending') {
					if (maxAttempts > 0 && attempts >= maxAttempts) {
						throw new NodeOperationError(
							this.getNode(),
							`Approval timeout after ${timeoutMinutes} minutes (request_id: ${requestId})`,
							{ itemIndex: i }
						);
					}

					// Wait before next poll
					await delay(pollingInterval * 1000);
					attempts++;

					// Check status
					const statusResponse = await this.helpers.httpRequest.call(this, {
						method: 'GET',
						url: `${credentials.domain}/api/v1/watches/${requestId}`,
						json: true,
						headers: {
							'X-API-Key': credentials.apiKey as string,
							'Accept': 'application/json',
						},
					});

					finalState = statusResponse.state;
					reason = statusResponse.result?.reason ?? "No reason provided";
				}

				// Handle final decision
				if (finalState === 'approved') {
					returnData.push({
						json: inputData,
						pairedItem: { item: i },
					});
				} else if (finalState === 'declined') {
					throw new NodeOperationError(
						this.getNode(),
						`Request was denied by Velatir (reason: ${reason}, request_id: ${requestId})`,
						{ itemIndex: i }
					);
				} else {
					throw new NodeOperationError(
						this.getNode(),
						`Unexpected state: ${finalState} (request_id: ${requestId})`,
						{ itemIndex: i }
					);
				}

			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: error instanceof Error ? error.message : 'Unknown error' },
						pairedItem: { item: i },
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}
