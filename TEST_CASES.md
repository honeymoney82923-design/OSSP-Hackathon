# 🧪 Test Cases and Live Demonstration Script
**OSSP Hackathon 2026 — 5-Minute Live Evaluation Guide**

Use this exact step-by-step walkthrough during your live demonstration to wow the evaluators and cover every expected requirement.

---

## ⏱️ 5-Minute Evaluation Pitch Outline

| Time | Segment | What to Show / Say |
| :--- | :--- | :--- |
| **0:00 - 0:45** | **Problem & Architecture** | Open `index.html`. Explain virtual-to-physical translation, bit decomposition (VPN vs Offset), and why TLB is required (eliminates double memory access). |
| **0:45 - 1:45** | **Scenario 1: TLB Hit (Fast Path)** | Input `0x1A4C`. Click **Translate**. Show how VPN `1` hits in TLB Slot #0 in **2 ns**. Physical address `0x2A4C` calculated instantly. |
| **1:45 - 2:45** | **Scenario 2: TLB Miss & Page Table Hit** | Input `0x0050`. Show TLB Miss $\to$ Page Table probe $\to$ hit in Frame #0 $\to$ TLB cache update. Highlight how latency was 202 ns. |
| **2:45 - 3:45** | **Scenario 3: Page Fault & Demand Paging** | Input `0x3200`. Page 3 is not in RAM. Show Page Fault trigger $\to$ Free Frame allocated $\to$ RAM frame grid update $\to$ TLB updated. |
| **3:45 - 4:30** | **Automated Benchmark & EAT** | Click **High Temporal Locality** preset $\to$ Click **Run Workload Batch**. Show live EAT drop to ~114 ns and Hit Ratio rise to >85%. |
| **4:30 - 5:00** | **CLI Tool & Conclusion** | Open terminal and show `python simulator.py` with ASCII tables. Open `presentation.html` slide deck. Take judges' questions. |

---

## 🔬 Detailed Test Cases Table

### Case 1: TLB Hit (Fast Path)
- **Action:** Enter `0x1A4C` into the address bar and click **Translate** (or press Enter).
- **Decomposition:**
  - Virtual Address: `0x1A4C` (6732 decimal)
  - VPN: `1` (Bits 15..12: `0001`)
  - Offset: `0xA4C` (2636 decimal, Bits 11..0: `101001001100`)
- **Execution Path:**
  1. VPN `1` is pre-cached in TLB Slot #0.
  2. TLB Hit! Fetches Frame `2`.
  3. Physical Address $= (2 \times 4096) + 2636 = \mathbf{0x2A4C}$.
- **KPI Impact:** TLB Hit Ratio = 100%, EAT = 102.00 ns.

---

### Case 2: TLB Miss followed by Page Table Hit
- **Action:** Enter `0x0080` and click **Translate**.
- **Decomposition:**
  - Virtual Address: `0x0080` (128 decimal)
  - VPN: `0`
  - Offset: `0x080` (128)
- **Execution Path:**
  1. TLB checked: Slot #0 has VPN 1, Slot #1-#3 empty. **TLB MISS**.
  2. Page Table checked: Page 0 has Valid bit = `1`, mapped to Frame #0.
  3. **PAGE TABLE HIT**.
  4. TLB Cache updated: Slot #1 now caches VPN `0` $\to$ Frame #0.
  5. Physical Address $= (0 \times 4096) + 128 = \mathbf{0x0080}$.
- **KPI Impact:** 1 Hit, 1 Miss $\to$ Hit Ratio = 50%, EAT = 152.00 ns.

---

### Case 3: Page Fault and Dynamic Frame Allocation
- **Action:** Enter `0x5100` and click **Translate**.
- **Decomposition:**
  - Virtual Address: `0x5100` (20736 decimal)
  - VPN: `5`
  - Offset: `0x100` (256)
- **Execution Path:**
  1. TLB checked: Not found (**TLB MISS**).
  2. Page Table checked: Page 5 has Valid bit = `0` (**PAGE FAULT**).
  3. Simulator scans Physical RAM for a free frame.
  4. Frame #3 is free $\to$ Allocated to Page 5.
  5. Page Table entry for Page 5 set to `Valid = 1, Frame = 3`.
  6. TLB Slot updated with VPN `5` $\to$ Frame `3`.
  7. Physical Address $= (3 \times 4096) + 256 = \mathbf{0x3100}$.

---

### Case 4: Cache Eviction Verification (LRU vs FIFO)
- **Action:** Click **Loop Pattern** workload preset and click **Run Workload Batch**.
- **Trace:** Accesses Pages `0`, `1`, `2`, `3`, `4` sequentially.
- **Observation:**
  - Since TLB capacity is 4 slots, when Page `4` is accessed, an eviction occurs.
  - In **LRU mode**, the least recently referenced slot is evicted.
  - In **FIFO mode**, the oldest loaded slot is evicted.
  - Switch policy in **Configure Memory** modal to verify the difference.

---

### Case 5: Terminal CLI Verification
Run the following in PowerShell/cmd:
```powershell
python simulator.py
```
- In the `sim>` prompt, type:
  ```text
  0x1A4C
  0x0080
  0x5100
  state
  sample
  ```
- Judges will see the ASCII table output and real-time calculation directly in terminal!
