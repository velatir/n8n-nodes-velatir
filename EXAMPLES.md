# Simple Velatir n8n Examples

## Example 1: Email Approval Gate

**Workflow**: Manual Trigger → Set Email Data → **Velatir** → Send Email

### Set Node:
```json
{
  "to": "customer@example.com",
  "subject": "Welcome to our service!",
  "body": "Thank you for signing up..."
}
```

### Velatir Node Settings:
- **Function Name**: "Send Welcome Email"
- **Description**: "Send welcome email to new customer"
- **Timeout**: 5 minutes

### What happens:
1. Approver sees request to "Send Welcome Email" with email data
2. If approved → Email data flows to Send Email node
3. If denied → Workflow stops with error

---

## Example 2: User Deletion Gate

**Workflow**: Webhook → **Velatir** → HTTP Request (Delete User)

### Webhook receives:
```json
{
  "user_id": "user_123",
  "email": "user@example.com",
  "reason": "Account termination requested"
}
```

### Velatir Node Settings:
- **Function Name**: "Delete User Account"  
- **Description**: "Permanently delete user and all data"
- **Timeout**: 30 minutes

### What happens:
1. Approver sees user deletion request with user details
2. If approved → User data flows to deletion API
3. If denied → No deletion occurs

---

## Example 3: Conditional High-Value Transaction

**Workflow**: Trigger → Get Transaction → IF (Amount > $1000) → **Velatir** → Process Payment

### Transaction data:
```json
{
  "transaction_id": "txn_456", 
  "amount": 2500,
  "recipient": "vendor@company.com",
  "description": "Equipment purchase"
}
```

### IF Node condition:
```javascript
{{ $json.amount > 1000 }}
```

### Velatir Node Settings:
- **Function Name**: "High Value Payment"
- **Description**: "Process payment over $1,000"
- **Timeout**: 60 minutes

### What happens:
1. Only transactions over $1,000 go to Velatir
2. Approver sees payment details and amount
3. If approved → Payment processes
4. If denied → Payment blocked

---

## Example 4: Content Publishing Gate

**Workflow**: Trigger → AI Content Check → IF (Flagged) → **Velatir** → Publish Content

### Content data:
```json
{
  "post_id": "post_789",
  "title": "Product Review",
  "content": "This product is amazing...",
  "author": "reviewer123",
  "ai_confidence": 0.75
}
```

### IF Node condition:
```javascript
{{ $json.ai_confidence < 0.9 }}
```

### Velatir Node Settings:
- **Function Name**: "Publish Content"
- **Description**: "Publish user content flagged by AI"
- **Timeout**: 120 minutes

---

## Example 5: Bulk Operations Gate

**Workflow**: Schedule → Get Users → **Velatir** → Bulk Email

### Bulk data:
```json
{
  "operation": "marketing_email",
  "recipient_count": 15000,
  "subject": "Black Friday Sale - 50% Off!",
  "campaign_id": "bf2024"
}
```

### Velatir Node Settings:
- **Function Name**: "Send Marketing Campaign"
- **Description**: "Send bulk email to 15,000 customers"  
- **Timeout**: 240 minutes

---

## Pro Tips

### 1. Use Descriptive Node Names
```
❌ "Velatir"
✅ "Approve Email Campaign"
✅ "Approve User Deletion"  
✅ "Approve High Value Payment"
```

### 2. Add Context in Descriptions
```
❌ "Send email"
✅ "Send welcome email to new customer after signup"
✅ "Send password reset email to user@example.com"
```

### 3. Set Appropriate Timeouts
```
• Email campaigns: 30-60 minutes
• User deletions: 60-120 minutes  
• Financial transactions: 30-240 minutes
• Content publishing: 60-480 minutes
```

### 4. Handle Denials Gracefully
Enable **"Continue on Fail"** and add error handling:

```
Velatir → IF (has error) → Send Notification ("Request was denied")
       → Normal flow
```

---

## Common Patterns

### Pattern 1: Simple Gate
```
Data Source → **Velatir** → Action
```

### Pattern 2: Conditional Gate  
```
Data Source → IF (risky?) → **Velatir** → Action
                         → Direct Action
```

### Pattern 3: Multi-Stage Approval
```
Data → **Velatir** (Stage 1) → Transform → **Velatir** (Stage 2) → Action
```

### Pattern 4: Approval with Fallback
```
Data → **Velatir** → IF (approved?) → Action
                   → Log Denial
```

---

## Testing Your Setup

### Minimal Test Workflow:
1. **Manual Trigger**
2. **Set** node: `{"test": "Hello World"}`  
3. **Velatir** node (default settings)
4. **No Op** node

Run it and check:
- ✅ Approval request appears in Velatir dashboard
- ✅ Approving continues workflow  
- ✅ Denying stops workflow with error
- ✅ Original data passes through unchanged