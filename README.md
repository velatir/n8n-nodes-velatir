# n8n-nodes-velatir

![Velatir](https://img.shields.io/badge/Velatir-Human--Approval--Gate-blue?style=flat-square)
![n8n-community-node-package](https://img.shields.io/badge/n8n-community--node-ff6d5a?style=flat-square)
![npm version](https://img.shields.io/npm/v/n8n-nodes-velatir?style=flat-square)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)

**Human approval gate for n8n workflows with flexible routing.** This community node integrates [Velatir](https://velatir.com) to pause your workflow until a human makes a decision, with two behavior modes to fit your needs.

## What does it do?

The Velatir node provides **flexible human approval** with two behavior modes:

### Mode 1: Traditional Approval Gate
1. **Data flows in** → Gets sent to Velatir for human review
2. **Workflow pauses** → Waits for human approval/denial  
3. **Data flows out unchanged** → If approved, continues to next node
4. **Workflow stops** → If denied/changes requested, workflow halts with error

### Mode 2: Decision-Based Routing (NEW!)
1. **Data flows in** → Gets sent to Velatir for human review
2. **Workflow pauses** → Waits for human decision
3. **Routes to different outputs** based on decision:
   - **Output 1**: Approved requests
   - **Output 2**: Declined requests
   - **Output 3**: Change requests with feedback

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

### Basic Usage (Traditional Mode)
Just drag the **Velatir** node between any two nodes in your workflow:

```
Trigger → [Your Data] → **Velatir** → [Next Action]
```

**That's it!** The node will:
- Automatically use your input data as the approval context
- Show the node name and description to approvers
- Pass through your original data unchanged when approved

### Advanced Usage (Decision Routing Mode)
Connect different nodes to each output for complex approval workflows:

```
Trigger → [Your Data] → **Velatir** → [Approved: Process Data]
                                  → [Declined: Send Rejection Email]  
                                  → [Change Requested: Handle requested change]
```

### Configuration Options

| Field | Description | Default |
|-------|-------------|---------|
| **Behavior Mode** | How to handle approval decisions | Wait for Approval (Fail if Denied) |
| **Function Name** | Name shown to approvers | Node name |
| **Description** | What this step does | Empty |
| **Polling Interval** | Check frequency (seconds) | 5 |
| **Timeout** | Max wait time (minutes) | 10 |
| **LLM Explanation** | AI context for approval decision | Empty |

#### Behavior Mode Options:
- **"Wait for Approval (Fail if Denied)"**: Traditional behavior - continues on approval, fails on decline/change request
- **"Route Based on Decision"**: Routes to different outputs based on approval decision

## Examples

### Traditional Mode Examples

#### Example 1: Email Campaign Approval
```
Manual Trigger → Set (Campaign Data) → **Velatir** → Send Email
```
The Velatir node shows approvers the campaign data and waits for approval before sending emails.

#### Example 2: High-Value Transaction
```
Schedule → Get Transactions → IF (Amount > $1000) → **Velatir** → Process Payment
```
Only high-value transactions go through the approval gate.

### Decision Routing Mode Examples

#### Example 3: Content Review Workflow
```
Webhook → **Velatir** (Route Mode) → [Approved: Publish Content]
                                   → [Declined: Archive Content]
                                   → [Changes Requested: Send to Editor]
```

#### Example 4: User Registration with Feedback
```
Form Submit → **Velatir** (Route Mode) → [Approved: Create Account + Welcome Email]
                                       → [Declined: Send Rejection Email]
                                       → [Changes Requested: Requested Additional Info]
```

#### Example 5: Invoice Processing
```
New Invoice → **Velatir** (Route Mode) → [Approved: Auto-Pay Invoice]
                                       → [Declined: Mark as Disputed]
                                       → [Changes Requested: Requested Clarification]
```

## What Approvers See

When a request needs approval, your team will see:

- **Function Name**: "Send Email Campaign" (or whatever you set)
- **Description**: "Send marketing email to 1,500 customers" 
- **Arguments**: All the input data from your workflow
- **LLM Explanation**: AI context about why approval is needed (if provided)
- **Metadata**: Workflow context (ID, execution, behavior mode, etc.)

## Data Output

All outputs include the original data plus `_velatir` metadata:

```json
{
  "originalData": "your workflow data",
  "_velatir": {
    "reviewTaskId": "uuid-of-review-task",
    "state": "approved|declined|change_requested",
    "requestedChange": "feedback from approver (if any)", 
    "behaviorMode": "approval_only|route_decision"
  }
}
```

## Best Practices

### ✅ Do:
- Use descriptive node names (they become the function name)
- Add helpful descriptions for complex operations
- Place approval gates before critical/irreversible actions
- Set appropriate timeouts for your team's response time
- Use decision routing mode for complex approval workflows
- Provide LLM explanations for better approval context
- Connect all three outputs when using routing mode

### ❌ Don't:
- Put approval gates in loops (can create many approval requests)
- Set very short timeouts for non-urgent operations
- Leave outputs unconnected in routing mode (data will be lost)
- Mix behavior modes within the same workflow branch

## Error Handling

### Traditional Mode:
- **If denied**: Workflow stops with a clear error message
- **If changes requested**: Workflow stops with change details
- **If timeout**: Workflow stops after the configured timeout
- **Continue on Fail**: Enable this to handle denials gracefully

### Decision Routing Mode:
- **If denied**: Data flows to "Declined" output (Output 2)
- **If changes requested**: Data flows to "Change Requested" output (Output 3) with feedback
- **If timeout**: Workflow stops after the configured timeout
- **Continue on Fail**: Errors flow to "Declined" output

## Workflow Patterns

### Traditional Mode Patterns

#### Pattern 1: Simple Gate
```
Data → **Velatir** → Action
```

#### Pattern 2: Conditional Gate
```
Data → IF (risky?) → **Velatir** → Action
                  → Direct Action
```

#### Pattern 3: Multiple Gates
```
Data → **Velatir** (Review) → Transform → **Velatir** (Final Check) → Action
```

### Decision Routing Mode Patterns

#### Pattern 4: Tri-Route Processing
```
Data → **Velatir** (Route Mode) → [Approved Path]
                                → [Declined Path] 
                                → [Revision Path]
```

#### Pattern 5: Feedback Loop
```
Data → **Velatir** (Route Mode) → [Approved: Process]
                                → [Declined: Log & Notify]
                                → [Changes: Edit] → **Velatir** (Route Mode)
```

#### Pattern 6: Escalation Workflow
```
Data → **Velatir** (Route Mode) → [Approved: Execute]
                                → [Declined: End]
                                → [Changes: Escalate] → Senior **Velatir** → Action
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Request timeout" | Increase timeout or check if approvers are available |
| "API key invalid" | Verify credential configuration in n8n |
| "Request declined" | Check with your team about decline reason |
| Node doesn't appear | Restart n8n after installation |
| "Unexpected state" | Update to latest node version (API may have changed) |
| Missing routing outputs | Check that all 3 outputs are connected in routing mode |
| Data not flowing to correct output | Verify behavior mode setting |

## Minimal Examples

### Traditional Mode (Simple)
1. **Manual Trigger** 
2. **Set** node with: `{"message": "Hello World"}`
3. **Velatir** node (default settings)
4. **No Op** node

When you run this:
- Your approver sees: Function "Velatir" needs approval with args `{"message": "Hello World"}`
- If approved: Data flows to No Op with `_velatir` metadata
- If denied: Workflow stops with error

### Decision Routing Mode (Advanced)
1. **Manual Trigger**
2. **Set** node with: `{"message": "Hello World"}`
3. **Velatir** node (set to "Route Based on Decision")
4. **No Op** node connected to "Approved" output
5. **Set** node connected to "Declined" output with message "Request declined"
6. **Set** node connected to "Change Requested" output with message "Changes needed"

When you run this, the workflow routes to different paths based on the approval decision.

## Support

- 📖 [Velatir Documentation](https://www.velatir.com/docs)
- 💬 [n8n Community Forum](https://community.n8n.io)
- 🐛 [Report Issues](https://github.com/velatir/n8n-nodes-velatir/issues)
- 📧 [Contact Support](mailto:hello@velatir.com)

## License

[MIT](LICENSE)