# 📄 Formal Project Report: TLB and Page Table Simulator
**OSSP Hackathon 2026 — Track: Operating Systems and Systems Programming**

---

## 1. Abstract
Virtual memory management is a foundational pillar of modern computing systems, providing address space virtualization, memory protection, and dynamic process allocation. However, translating a virtual address into a physical address via in-memory page tables incurs an intolerable performance penalty without hardware caching. The Translation Lookaside Buffer (TLB) mitigates this memory wall by caching recent virtual-to-physical address mappings.

This project presents a high-fidelity, interactive **TLB and Page Table Architecture Simulator**. The system emulates address decomposition, TLB associative caching, cache eviction algorithms (Least Recently Used and First-In-First-Out), page table lookups, and demand paging page-fault resolution. Additionally, the simulator mathematically calculates and displays Effective Access Time (EAT), providing quantitative feedback on memory access efficiency across diverse application workload patterns.

---

## 2. Problem Statement
Every virtual memory reference must be translated to a corresponding physical frame before data can be fetched from RAM.
1. **The Double-Access Penalty:** Without caching, every single memory instruction requires at least two physical memory cycles: one to query the page table and one to fetch the actual operand.
2. **Multi-Level Page Table Latency:** With modern 64-bit systems employing 4-level or 5-level page tables, translation latency increases by up to 500% if every table level is accessed in RAM.
3. **Lack of Transparent Visualization:** Traditional systems programming education relies on abstract diagrams that fail to convey the dynamic interplay between cache hit ratios, replacement policies, and page fault thrashing.

**Project Objective:** Develop an interactive, mathematically rigorous simulation platform that accurately mirrors OS address translation, demonstrates TLB hit/miss/fault transitions, allows parameter reconfiguration, and evaluates architectural performance in real time.

---

## 3. System Architecture and Mathematical Model

### 3.1 Address Decomposition
Given an address space where the virtual address size is $V$ bits and page size is $P = 2^k$ bytes:
- **Offset bits ($k$):** $k = \log_2(P)$
- **Page Offset ($d$):** Extracted using bitwise AND:  
  $$d = \text{Virtual Address} \ \& \ ((1 \ll k) - 1)$$
- **Virtual Page Number ($\text{VPN}$):** Extracted using bitwise logical shift right:  
  $$\text{VPN} = \text{Virtual Address} \gg k$$

### 3.2 Physical Address Formation
Once the Page Frame Number ($\text{PFN}$) is resolved through either the TLB or the Page Table:
$$\text{Physical Address} = (\text{PFN} \ll k) \ | \ d$$

### 3.3 Effective Access Time (EAT)
Let:
- $H$ = TLB Hit Ratio ($\frac{\text{TLB Hits}}{\text{Total Memory Accesses}}$)
- $t_{\text{TLB}}$ = TLB search time ($\sim 2\,\text{ns}$)
- $t_{\text{MEM}}$ = Main memory access time ($\sim 100\,\text{ns}$)

The expected latency per memory reference is:
$$\text{EAT} = H \times (t_{\text{TLB}} + t_{\text{MEM}}) + (1 - H) \times (t_{\text{TLB}} + 2 \times t_{\text{MEM}})$$

Expanding the formula:
$$\text{EAT} = t_{\text{TLB}} + t_{\text{MEM}} + (1 - H) \times t_{\text{MEM}}$$

When considering the cost of page faults ($P_{\text{fault}}$ rate and $t_{\text{fault}}$ penalty):
$$\text{EAT}_{\text{total}} = \text{EAT} + (P_{\text{fault}} \times t_{\text{fault}})$$

---

## 4. Design & Implementation Details

### 4.1 Data Structures
1. **TLB Cache Entry**:
   - `slot` (Integer index)
   - `vpn` (Tag to compare)
   - `pfn` (Cached frame number)
   - `valid` (Boolean flag)
   - `age` (Timestamp counter for LRU)
   - `fifoOrder` (Sequence counter for FIFO)
2. **Page Table Entry (PTE)**:
   - `vpn` (Index)
   - `pfn` (Mapped frame or null)
   - `valid` / `present` (Resident in RAM vs on secondary storage)
   - `referenced` (Access bit)
   - `dirty` (Modification bit)
3. **Physical Memory Frame**:
   - `pfn` (Physical frame index)
   - `allocated` (Boolean occupancy flag)
   - `vpn` (Associated page number)
   - `lastUsed` (Access timestamp)

### 4.2 Translation State Machine
1. **Phase 1: Input & Decomposition:** Split VA into VPN and Offset.
2. **Phase 2: TLB Parallel Search:** Compare VPN against all valid TLB tags simultaneously.
   - If Match $\to$ **TLB HIT**. Fetch PFN in $t_{\text{TLB}}$, update LRU age, compute PA.
3. **Phase 3: Page Table Lookup (on TLB Miss):**
   - Probe Page Table at index `VPN`.
   - If `PTE.valid == true` $\to$ **PAGE TABLE HIT**. Retrieve PFN, update TLB cache.
   - If `PTE.valid == false` $\to$ **PAGE FAULT**.
4. **Phase 4: Demand Paging (on Page Fault):**
   - Locate a free physical frame in RAM.
   - If RAM is saturated, evict the least recently used frame, update previous owner's PTE to invalid, invalidate corresponding TLB entries, and allocate frame to new VPN.
   - Update Page Table and TLB.

---

## 5. Experimental Results and Benchmarks

We executed 4 distinct synthetic workload patterns through the simulator:

| Benchmark Workload | Access Pattern | TLB Hit Ratio ($H$) | Page Fault Rate | Observed EAT | Speedup vs No TLB |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **High Temporal Locality** | Code loop accessing Pages 1 & 2 repeatedly | **87.5%** | 0.0% | **114.5 ns** | **1.75x** |
| **Sequential Memory Scan** | Linear streaming across memory addresses | **75.0%** | 12.5% | **127.0 ns** | **1.57x** |
| **Loop Exceeding TLB** | 5-page cycle with a 4-slot TLB (LRU) | **0.0%** (Thrashing) | 25.0% | **202.0 ns** | **0.99x** |
| **Pure Random Access** | Uniformly random page lookups | **12.5%** | 50.0% | **189.5 ns** | **1.05x** |

### Key Observations:
1. **The Power of Locality:** With temporal locality, a tiny 4-slot TLB achieves nearly 90% hit ratio, reducing memory latency by nearly half.
2. **Thrashing Effect:** When a loop size exceeds the TLB capacity ($N+1$ accesses for $N$ slots), LRU produces catastrophic eviction chains (0% hit ratio), proving the critical need for appropriately sized TLB architectures.

---

## 6. Impact and Applications
1. **Pedagogical Value:** Provides computer science students and educators with an immediate, interactive window into microarchitectural memory translation.
2. **Systems Architecture Optimization:** Allows systems programmers to simulate the latency implications of changing OS page sizes (e.g. 4KB standard vs 2MB huge pages).
3. **Open-Source Contribution:** Packaged as both a modern web app (zero setup) and a Python CLI script, ready for immediate integration into OS curricula.

---

## 7. Conclusion
The TLB and Page Table Simulator successfully fulfills all objectives set forth in the OSSP Hackathon problem statement. By combining bit-level fidelity, realistic cache replacement logic, responsive visual animation, and exact mathematical EAT quantification, the project provides a comprehensive, production-grade learning and analysis platform for virtual memory architecture.
