import { VersionedNodeType } from 'n8n-workflow';
import type { INodeTypeBaseDescription, IVersionedNodeType } from 'n8n-workflow';
import { VelatirV1 } from './v1/VelatirV1.node';
import { VelatirV2 } from './v2/VelatirV2.node';

export class Velatir extends VersionedNodeType {
	constructor() {
		const baseDescription: INodeTypeBaseDescription = {
			displayName: 'Velatir',
			name: 'velatir',
			icon: 'file:velatir.svg',
			group: ['transform'],
			description: 'AI compliance and approval workflows',
			defaultVersion: 2,
		};
		const nodeVersions: IVersionedNodeType['nodeVersions'] = {
			1: new VelatirV1(baseDescription),
			2: new VelatirV2(baseDescription),
		};
		super(nodeVersions, baseDescription);
	}
}
