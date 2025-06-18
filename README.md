# n8n-nodes-velatir

![Velatir](https://img.shields.io/badge/Velatir-Human--Approval--Gate-blue?style=flat-square)
![n8n-community-node-package](https://img.shields.io/badge/n8n-community--node-ff6d5a?style=flat-square)
![npm version](https://img.shields.io/npm/v/n8n-nodes-velatir?style=flat-square)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)

**Simple human approval gate for n8n workflows.** This community node integrates [Velatir](https://velatir.com) to pause your workflow until a human approves the next step.

## What does it do?

The Velatir node acts as a **simple approval gate** in your workflow:

1. **Data flows in** → Gets sent to Velatir for human review
2. **Workflow pauses** → Waits for human approval/denial  
3. **Data flows out unchanged** → If approved, original data continues to next node
4. **Workflow stops** → If denied, workflow execution halts with error

## Installation

### Option 1: Community Nodes Panel (Recommended)
1. Go to **Settings > Community Nodes** in n8n
2. Select **Install**
3. Enter `n8n-nodes-velatir`
4. Select **Install**

### Option 2: Manual Installation
```bash
npm install n8n-nodes-velatir
```

## Setup

### 1. Get your Velatir API Key
- Sign up at [velatir.com](https://velatir.com)
- Get your API key from the dashboard

### 2. Add Credentials in n8n
- Go to **Settings > Credentials**
- Create new **Velatir API** credential
- Enter your API key
- Save

## Usage

### Basic Usage
Just drag the **Velatir** node between any two nodes in your workflow:

```
Trigger → [Your Data] → **Velatir** → [Next Action]
```

**That's it!** The node will:
- Automatically use your input data as the approval context
- Show the node name and description to approvers
- Pass through your original data unchanged when approved

### Configuration Options

| Field | Description | Default |
|-------|-------------|---------|
| **Function Name** | Name shown to approvers | Node name |
| **Description** | What this step does | Empty |
| **Polling Interval** | Check frequency (seconds) | 5 |
| **Timeout** | Max wait time (minutes) | 10 |

## Examples

### Example 1: Email Campaign Approval
```
Manual Trigger → Set (Campaign Data) → **Velatir** → Send Email
```

The Velatir node will show approvers the campaign data and wait for approval before sending emails.

### Example 2: User Deletion Approval  
```
Webhook → **Velatir** → HTTP Request (Delete User)
```

Any user deletion request will require human approval before executing.

### Example 3: High-Value Transaction
```
Schedule → Get Transactions → IF (Amount > $1000) → **Velatir** → Process Payment
```

Only high-value transactions go through the approval gate.

## What Approvers See

When a request needs approval, your team will see:

- **Function Name**: "Send Email Campaign" (or whatever you set)
- **Description**: "Send marketing email to 1,500 customers" 
- **Arguments**: All the input data from your workflow
- **Metadata**: Workflow context (ID, execution, etc.)

## Best Practices

### ✅ Do:
- Use descriptive node names (they become the function name)
- Add helpful descriptions for complex operations
- Place approval gates before critical/irreversible actions
- Set appropriate timeouts for your team's response time

### ❌ Don't:
- Put approval gates in loops (can create many approval requests)
- Set very short timeouts for non-urgent operations
- Forget to handle the "denied" case in your workflow design

## Error Handling

**If denied**: Workflow stops with a clear error message
**If timeout**: Workflow stops after the configured timeout
**Continue on Fail**: Enable this to handle denials gracefully

## Workflow Patterns

### Pattern 1: Simple Gate
```
Data → **Velatir** → Action
```

### Pattern 2: Conditional Gate
```
Data → IF (risky?) → **Velatir** → Action
                  → Direct Action
```

### Pattern 3: Multiple Gates
```
Data → **Velatir** (Review) → Transform → **Velatir** (Final Check) → Action
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Request timeout" | Increase timeout or check if approvers are available |
| "API key invalid" | Verify credential configuration in n8n |
| "Request denied" | Check with your team about denial reason |
| Node doesn't appear | Restart n8n after installation |

## Minimal Example

The simplest possible workflow:

1. **Manual Trigger** 
2. **Set** node with: `{"message": "Hello World"}`
3. **Velatir** node (default settings)
4. **No Op** node

When you run this:
- Your approver sees: Function "Velatir" needs approval with args `{"message": "Hello World"}`
- If approved: `{"message": "Hello World"}` flows to No Op
- If denied: Workflow stops with error

## Support

- 📖 [Velatir Documentation](https://www.velatir.com/docs)
- 💬 [n8n Community Forum](https://community.n8n.io)
- 🐛 [Report Issues](https://github.com/velatir/n8n-nodes-velatir/issues)
- 📧 [Contact Support](mailto:hello@velatir.com)

## License

[MIT](LICENSE)