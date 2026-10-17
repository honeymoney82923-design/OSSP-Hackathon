# 🧠 TLB and Page Table Simulator
**Virtual-to-Physical Address Translation Engine & Memory Architecture Visualizer**  
*Developed for OSSP Hackathon 2026*

---

## 📌 Executive Summary
In modern operating systems, virtual memory provides process isolation, address space expansion, and protection. However, address translation through hierarchical page tables introduces significant latency (the "Memory Wall"). The **Translation Lookaside Buffer (TLB)** acts as an associative on-chip hardware cache to bypass main memory lookups.

This project delivers a **comprehensive, dual-mode simulator (Interactive Web GUI + Python CLI)** that models the entire address translation pipeline, bit-level address decomposition, cache hit/miss logic, page fault recovery via demand paging, and live **Effective Access Time (EAT)** performance metrics.

---

## ✨ Key Features
1. **Interactive Dual-Mode System**:
   - **Modern Web Dashboard**: Glassmorphic, dark-mode real-time visualization of TLB entries, Page Table mappings, and Physical RAM frames.
   - **Terminal CLI Simulator**: Python 3 engine with ASCII table dumps, REPL interface, and automated trace verification.
2. **Bit-Level Decomposition**:
   - Real-time bit manipulation extracting **Virtual Page Number (VPN)** and **Page Offset ($d$)** from 16-bit virtual addresses.
3. **Hardware Cache Simulation (TLB)**:
   - Configurable capacity (2 to 16 slots).
   - Pluggable cache replacement policies: **Least Recently Used (LRU)** and **First-In First-Out (FIFO)**.
4. **Demand Paging & Page Fault Handling**:
   - Dynamic physical frame allocation and frame eviction when memory is saturated.
5. **Real-time Performance Metrics & EAT**:
   - Live calculations for TLB Hit Ratio ($H$), Page Fault Rate, and **Effective Access Time (EAT)**.
6. **Pre-built Benchmark Suites**:
   - Temporal Locality, Sequential Scan, Loop Thrashing, and Random Access patterns.

---

## 📐 Mathematical Formulation: Effective Access Time (EAT)

The Effective Access Time measures the average latency required to access a byte in memory:

$$\text{EAT} = H \times (t_{\text{TLB}} + t_{\text{MEM}}) + (1 - H) \times (t_{\text{TLB}} + 2 \times t_{\text{MEM}})$$

Where:
- $H$: TLB Hit Ratio ($\frac{\text{Hits}}{\text{Total Accesses}}$)
- $t_{\text{TLB}}$: TLB Search Time ($\approx 2\,\text{ns}$)
- $t_{\text{MEM}}$: Main Memory Access Time ($\approx 100\,\text{ns}$)

### When Page Faults are Factored In:
$$\text{EAT}_{\text{total}} = \text{EAT} + (\text{Page Fault Rate} \times \text{Fault Penalty})$$

---

## 🚀 Quick Start Guide

### Option 1: Interactive Web Simulator (Zero Installation)
Simply open `index.html` in any web browser:
```bash
# On Windows PowerShell:
Start-Process index.html

# Or open presentation slides:
Start-Process presentation.html
```

### Option 2: Python Command-Line Interface
Requires Python 3.6+:
```bash
# Run with default settings (4KB Page, 4 TLB slots, LRU):
python simulator.py

# Run with customized architecture parameters:
python simulator.py --pagesize 1024 --tlb 8 --policy FIFO --frames 16
```

#### CLI Commands:
- Type any address in Hex (`0x1A4C`) or Decimal (`6732`) to translate.
- Type `state` to view the full TLB and Page Table tables.
- Type `sample` to run an automated benchmark trace.
- Type `exit` to quit.

---

## 📂 Project Directory Structure

```text
tlb-page-table-simulator/
├── index.html           # Main visual simulator dashboard (HTML5)
├── style.css            # Dark cyberpunk/academic design system
├── app.js               # Core JavaScript translation engine & UI binding
├── presentation.html    # Interactive slide deck for live presentation
├── simulator.py         # Python 3 terminal simulator with ASCII tables
├── README.md            # Comprehensive project documentation
├── PROJECT_REPORT.md    # Formal hackathon project report
├── TEST_CASES.md        # Step-by-step verification and demo scenarios
└── PRESENTATION.md      # Team presentation script & speaker notes
```

---

## 🧪 Verification & Sample Test Scenarios

### Test Case 1: TLB Hit (Fast Path)
- **Input:** Virtual Address `0x1A4C` (VPN = `1`, Offset = `0xA4C`)
- **Initial Condition:** VPN `1` pre-cached in TLB Slot #0 $\to$ Frame #2
- **Result:** **TLB HIT** in Slot #0
- **Physical Address:** $(2 \times 4096) + 2636 = \mathbf{0x2A4C}$
- **Latency:** $2\,\text{ns} + 100\,\text{ns} = 102\,\text{ns}$

### Test Case 2: TLB Miss $\to$ Page Table Hit
- **Input:** Virtual Address `0x0050` (VPN = `0`, Offset = `0x050`)
- **Condition:** VPN `0` is in Page Table (Frame #0), but not in TLB.
- **Result:** **TLB MISS** $\to$ **PAGE TABLE HIT**. TLB is updated.
- **Physical Address:** $(0 \times 4096) + 80 = \mathbf{0x0050}$
- **Latency:** $2\,\text{ns} + 200\,\text{ns} = 202\,\text{ns}$

### Test Case 3: Page Fault (Demand Paging)
- **Input:** Virtual Address `0x3200` (VPN = `3`, Offset = `0x200`)
- **Condition:** VPN `3` not loaded in memory (Invalid bit in Page Table).
- **Result:** **PAGE FAULT** $\to$ Free Frame #3 allocated $\to$ Page Table updated $\to$ TLB cached.
- **Physical Address:** $(3 \times 4096) + 512 = \mathbf{0x3200}$

---

## 👥 Team Roles & Responsibilities
- **Lead Architect:** Memory subsystem modeling, bitwise decomposition algorithms, and EAT formulations.
- **Cache & Systems Engineer:** TLB associative lookup, LRU and FIFO eviction policies, page fault state machine.
- **Frontend & Visual Engineer:** Responsive UI/UX, animated translation pipeline, data visualizers.
- **Validation & QA Engineer:** Benchmark trace generation, CLI implementation, automated test cases, documentation.

---

## 📜 License & Originality
This project was developed strictly for academic demonstration and open-source operating system educational benchmarking during OSSP Hackathon 2026.
