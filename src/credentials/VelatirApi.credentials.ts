import {
	IAuthenticateGeneric,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class VelatirApi implements ICredentialType {
	name = 'velatirApi';
	displayName = 'Velatir API';
	documentationUrl = 'https://www.velatir.com/docs';
	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'Your Velatir API key. You can find this in your Velatir dashboard.',
		},
	];

	// Configure authentication method
	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'X-API-Key': '={{$credentials.apiKey}}',
			},
		},
	};
}