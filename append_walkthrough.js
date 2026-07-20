const fs = require('fs');
const content = `
### Wave 7: Reclamations Core (Parent-Child Tracking)
**What was changed:**
- **Database Schema**: 
  - Added \`is_reclamation_frozen\` (boolean) to \`orders\`.
- **RPC \`create_reclamation\`**:
  - Implemented idempotent child-order creation returning UUID.
  - Generates \`-R1\`, \`-R2\` numbering logic automatically based on existing child count.
  - Copies \`order_contacts\`, \`order_addresses\`, and \`order_specifications\` to the child order safely.
  - Freezes the parent order (\`is_reclamation_frozen = true\`) preventing completion until the child order is complete.
  - If \`reclamation_type = INSTALLATION\`, safely triggers the state machine using \`change_order_status\` to move the parent order to \`INSTALLATION_RECLAMATION\` while logging the transition reason.
- **Triggers**:
  - Added \`trg_reclamation_unfreeze_parent_update\` on \`orders\` to dynamically unfreeze the parent order when all child orders achieve \`COMPLETED\` or \`CANCELLED\` status.
  - Unfreezing moves an \`INSTALLATION_RECLAMATION\` parent automatically to \`INSTALLATION_SCHEDULING\` for a secondary run.
- **RPC \`change_order_status\` Modifications**:
  - Blocked completion of frozen orders.
  - Prevented direct status advancement if a parent has an active reclamation.

**What was tested:**
- End-To-End test (\`test_wave7_e2e_pg.js\`) confirmed:
  - AppSheet simulation correctly sets status and freeze.
  - MES simulation correctly retains current status but adds a freeze.
  - Parent order completion is blocked during freeze.
  - Parent is successfully unfrozen and transitioned when child order completes.
  - Idempotency checks correctly prevent duplicate order creation for the same key.

**Artifacts generated:**
- [WAVE_7_DB_PROOFS](file:///C:/Users/b_dulysh/.gemini/antigravity-ide/brain/5487cb0d-5702-4c24-aa64-bd0762c71d0f/WAVE_7_DB_PROOFS.md)

---`;
fs.appendFileSync('C:/Users/b_dulysh/.gemini/antigravity-ide/brain/5487cb0d-5702-4c24-aa64-bd0762c71d0f/walkthrough.md', '\n' + content);
