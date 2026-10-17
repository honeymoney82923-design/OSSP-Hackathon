# 🎙️ Presentation Script & Team Speaker Notes
**OSSP Hackathon 2026: TLB and Page Table Simulator**

Use this script alongside `presentation.html` (interactive presentation) or export these points directly into Microsoft PowerPoint / Google Slides.

---

## 👥 Suggested Team Role Allocation

| Member | Role | Assigned Slides / Topics |
| :--- | :--- | :--- |
| **Speaker 1** | System Architect & Intro | Slide 1 & 2: Introduction, Problem Statement, Memory Wall |
| **Speaker 2** | Hardware & Systems Modeler | Slide 3 & 4: Address Decomposition, TLB Cache, LRU/FIFO Algorithms |
| **Speaker 3** | Mathematician & Evaluator | Slide 5: Effective Access Time (EAT) Formula, Latency Derivation |
| **Speaker 4** | Live Demo & QA Lead | Slide 6 & 7: Live System Demonstration, Benchmarks, Impact & Q&A |

---

## 📑 Slide-by-Slide Script & Talking Points

### Slide 1: Title & Overview
- **Speaker 1:**
  > "Respected judges and peers, good morning. Today we present our project: **The TLB and Page Table Architecture Simulator**. Our system provides a high-fidelity visual and mathematical simulation of virtual-to-physical address translation in modern operating systems. We have delivered a complete working prototype in both an interactive web dashboard and a terminal CLI, backed by formal mathematical verification."

---

### Slide 2: Problem Statement & Motivation
- **Speaker 1:**
  > "In virtual memory systems, process isolation and protection come at a cost: every memory reference requires address translation. If done solely via in-memory page tables, every read or write requires two physical memory accesses—effectively cutting memory performance in half. This is known as the Memory Wall. Our simulator demonstrates how a Translation Lookaside Buffer solves this problem and visualizes the exact operational mechanics of hits, misses, and page faults."

---

### Slide 3: System Architecture & Decomposition
- **Speaker 2:**
  > "Our architecture models a 16-bit virtual address space. When a virtual address is referenced, our hardware model splits it at the bit level: the lower $k$ bits form the page offset, and the upper bits represent the Virtual Page Number (VPN). The simulator maintains three core hardware tables: a fully associative on-chip TLB, a process Page Table, and physical memory frames in RAM. Translations first probe the TLB fast-path in just 2 nanoseconds."

---

### Slide 4: Translation Pipeline & Eviction Algorithms
- **Speaker 2:**
  > "The translation follows a 4-stage pipeline. On a TLB Hit, the physical frame is retrieved immediately. On a TLB Miss, the system falls back to the Page Table. If the page is present in RAM, the TLB is updated. If the page is invalid, a Page Fault is raised, triggering demand paging to allocate a frame. When the TLB is full, our system implements two configurable replacement policies: **Least Recently Used (LRU)** via access timestamps, and **First-In, First-Out (FIFO)** via allocation sequence counters."

---

### Slide 5: Mathematical Verification & EAT
- **Speaker 3:**
  > "To quantitatively prove the benefit of the TLB, we model Effective Access Time (EAT). The formula is:
  > $$\text{EAT} = H \times (t_{\text{TLB}} + t_{\text{MEM}}) + (1 - H) \times (t_{\text{TLB}} + 2 \times t_{\text{MEM}})$$
  > Without a TLB, every access requires 200 nanoseconds. With a 90% TLB hit ratio, our EAT drops to 112 nanoseconds—a 44% overall performance improvement. Our simulator calculates this dynamically on every single memory reference."

---

### Slide 6: Live Benchmarks & Experimental Results
- **Speaker 4:**
  > "We tested our engine against real-world memory access patterns. In our **Temporal Locality** benchmark, repetitive code loops achieve an 87.5% hit ratio. In contrast, our **Loop Thrashing** benchmark proves what happens when working sets exceed cache size: hit ratio drops to 0%, demonstrating the severe penalty of cache evictions. Our simulator handles both manual step-by-step walks and automated batch workloads."

---

### Slide 7: Conclusion, Impact & Q&A
- **Speaker 4:**
  > "Our solution provides a dual-environment tool: an interactive browser-based visualizer requiring zero installation, and a lightweight Python 3 CLI for automated test scripting. It bridges the gap between theoretical OS concepts and tangible system design. We now welcome questions from the evaluation panel."

---

## ❓ Anticipated Judges' Questions & Model Answers

### Q1: "Why did you implement both LRU and FIFO?"
**Answer:**  
> "FIFO is simple to implement in hardware with minimal area overhead, but suffers from Belady's Anomaly and can evict heavily used pages. LRU adheres closely to the principle of temporal locality, yielding higher hit ratios for typical programs. Offering both allows direct empirical comparison of their hit ratios under identical traces."

### Q2: "What happens when a Page Fault occurs?"
**Answer:**  
> "A Page Fault means the referenced page is not resident in physical RAM. The OS trap handler finds an unallocated frame. If RAM is full, it evicts an existing frame using our frame-replacement policy, marks the old page invalid, flushes stale TLB entries, reads the new page into the frame, updates the Page Table, and finally caches the mapping in the TLB."

### Q3: "How does your simulator handle different page sizes?"
**Answer:**  
> "Our architecture is fully dynamic. When the page size changes (e.g., from 4KB to 1KB or 256B), the simulator recalculates the offset bits $k = \log_2(\text{PageSize})$, adjusts the bit masks, shifts the VPN extraction logic, and resizes the address breakdown display in real time."
